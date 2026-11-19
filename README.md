# LEGO Sorter

Fotopõhine LEGO City komplektide taastamise veebirakendus.

## Kasutamine

1. Käivita rakendus.
2. Sisesta tasuta [Rebrickable API võti](https://rebrickable.com/api/).
3. Lisa oma LEGO komplekti number (näiteks `60337`).
4. Laota 5–15 klotsi matile ühevärvilisele alusele, nii et need ei kattuks.
5. Tee telefoniga foto, vajuta „Skaneeri klotsid” ja kinnita sobivad detailid.
6. Kogutud osade arv jääb sinu brauseri salvestusse.

**Tuvastus on esialgne:** Brickognize pakub detaili kuju kandidaate ning süsteem võrdleb neid Rebrickable nimekirjaga. Värvi ja täpset vastet tuleb käsitsi kontrollida. Äpp ei erista identsete klotside algset päritolu.

## Kohalik käivitamine

```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

Ava `http://localhost:8000`.

## Renderisse avaldamine

Loo [Renderis](https://dashboard.render.com/) uus **Blueprint** ja ühenda GitHubi hoidla `nightly-estonia/lego-sorter`. Render loeb `render.yaml` faili ning käivitab FastAPI veebiserveri. Tasuta teenuse plaani olemasolu ja tingimused sõltuvad Renderi hinnakirjast.

See ei ole veel reaalajas videopildi AR-rakendus, vaid fotopõhine prototüüp. Pildid saadetakse tuvastamiseks Brickognize API-le. Olemasolevas versioonis pole kasutajakontosid ega serveris pikaajalist kogumise salvestust.
