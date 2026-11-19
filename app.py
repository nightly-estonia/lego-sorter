from __future__ import annotations
import os, re, json
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor
import requests, cv2, numpy as np
from PIL import Image, ImageOps
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import FileResponse

app = FastAPI(title="LEGO Sorter")
BASE = os.path.dirname(__file__)
RB = "https://rebrickable.com/api/v3/lego"
BG = "https://api.brickognize.com/predict/parts/"

@app.get("/")
def index():
    return FileResponse(os.path.join(BASE,"static","index.html"))

@app.get("/health")
def health():
    return {"ok":True}

def rbget(path, key, params=None):
    try:
        r=requests.get(RB+path,headers={"Authorization":"key "+key},
                       params=params,timeout=20)
        if r.status_code in (401,403): raise HTTPException(401,"Kontrolli Rebrickable API võtit")
        if r.status_code==404: raise HTTPException(404,"Komplekti ei leitud")
        r.raise_for_status()
        return r.json()
    except requests.RequestException:
        raise HTTPException(502,"Rebrickable päring ebaõnnestus")

@app.get("/api/set/{number}")
def get_set(number: str,key: str):
    if not re.fullmatch(r"\d{3,8}(?:-\d+)?",number):
        raise HTTPException(400,"Vigane komplekti number")
    number=number if "-" in number else number+"-1"
    s=rbget("/sets/"+number+"/",key)
    parts=[]
    for page in range(1,21):
        data=rbget("/sets/"+number+"/parts/",key,
                   {"page_size":1000,"page":page,"inc_minifig_parts":1})
        for item in data.get("results",[]):
            if item.get("is_spare"): continue
            p=item.get("part") or {}
            c=item.get("color") or {}
            parts.append({"part_num":str(p.get("part_num","")),
                          "name":p.get("name",""),"color_id":c.get("id"),
                          "color_name":c.get("name",""),
                          "quantity":item.get("quantity",1),
                          "image":p.get("part_img_url")})
        if not data.get("next"):break
    return {"number":number,"name":s.get("name"),"image":s.get("set_img_url"),
            "year":s.get("year"),"parts":parts}

def segment(img):
    rgb=np.array(img.convert("RGB"))
    scale=min(1,1400/max(rgb.shape[:2]))
    if scale<1:rgb=cv2.resize(rgb,None,fx=scale,fy=scale)
    lab=cv2.cvtColor(rgb,cv2.COLOR_RGB2LAB).astype(np.float32)
    h,w=lab.shape[:2]; z=max(7,int(min(h,w)*.035))
    corners=np.concatenate([lab[:z,:z].reshape(-1,3),lab[:z,-z:].reshape(-1,3),
                            lab[-z:,:z].reshape(-1,3),lab[-z:,-z:].reshape(-1,3)])
    mask=(np.linalg.norm(lab-np.median(corners,axis=0),axis=2)>25).astype(np.uint8)*255
    k=max(3,int(min(w,h)*.004)|1)
    kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(k,k))
    mask=cv2.morphologyEx(mask,cv2.MORPH_OPEN,kernel)
    mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,kernel)
    contours,_=cv2.findContours(mask,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    out=[]
    for contour in contours:
        x,y,bw,bh=cv2.boundingRect(contour)
        area=cv2.contourArea(contour)
        if area<w*h*.0012 or bw<18 or bh<14 or area/(bw*bh)<.2:continue
        if bw>w*.83 or bh>h*.83:continue
        pad=max(10,int(min(bw,bh)*.12))
        out.append((max(0,x-pad)/w,max(0,y-pad)/h,
                    min(w,x+bw+pad)/w,min(h,y+bh+pad)/h))
    return sorted(out,key=lambda b:(round(b[1]*10),b[0]))[:15]

def classify(img,box):
    w,h=img.size
    x1,y1,x2,y2=box
    tile=img.crop((int(x1*w),int(y1*h),int(x2*w),int(y2*h)))
    tile.thumbnail((800,800))
    buf=BytesIO();tile.save(buf,format="JPEG",quality=85)
    try:
        r=requests.post(BG,files={"query_image":("part.jpg",buf.getvalue(),"image/jpeg")},timeout=35)
        r.raise_for_status()
        return r.json().get("items",[])[:5],None
    except requests.RequestException as e:
        return [],str(e)[:100]

@app.post("/api/scan")
async def scan(file:UploadFile=File(...),parts:str=Form("[]")):
    raw=await file.read(12*1024*1024+1)
    if len(raw)>12*1024*1024:raise HTTPException(413,"Foto on liiga suur")
    try:
        img=ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
        inv=json.loads(parts)
        if not isinstance(inv,list) or len(inv)>5000:raise ValueError()
    except Exception:raise HTTPException(400,"Vigane foto või detailide loend")
    img.thumbnail((2000,2000))
    boxes=segment(img)
    if not boxes:return {"detections":[],"message":"Ei leidnud eraldatud klotse. Proovi ühtlast tausta."}
    with ThreadPoolExecutor(max_workers=3) as pool:
        answers=list(pool.map(lambda b:classify(img,b),boxes))
    detections=[]
    for i,(box,(candidates,error)) in enumerate(zip(boxes,answers)):
        matches=[]
        for c in candidates:
            cid=str(c.get("id",""))
            for part in inv:
                pid=str(part.get("part_num",""))
                if cid==pid or (len(cid)>3 and cid.rstrip("abcdefghijklmnopqrstuvwxyz")==pid.rstrip("abcdefghijklmnopqrstuvwxyz")):
                    match=dict(part);match["score"]=round(float(c.get("score",0)),2)
                    matches.append(match)
        unique={}
        for m in matches:
            key=f'{m["part_num"]}:{m["color_id"]}'
            if key not in unique or unique[key]["score"]<m["score"]:unique[key]=m
        detections.append({"id":i,"box":box,"matches":list(unique.values())[:8],
                           "candidates":[{"id":c.get("id"),"name":c.get("name")} for c in candidates[:3]],
                           "error":error})
    return {"detections":detections,
            "notice":"AI pakub võimalikke kujusid. Värv ja detaili õigsus tuleb käsitsi üle kontrollida."}
