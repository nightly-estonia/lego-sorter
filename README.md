# LEGO Sorter

Fotopõhine LEGO City komplektide taastamise veebirakendus.

## Kasutamine

1. Ava rakendus GitHub Pagesis või käivita FastAPI kohalikult.
2. Vali foto või vajuta „Tee foto”, luba brauseril kaamerat kasutada ja vajuta eelvaates „Pildista”. Pildista karbi esikülge või valmis mudelit.
3. Vajuta „Tuvasta komplekt” ja vali Brickognize’i pakutud vastetest sobiv komplekt.
4. Sisesta [Rebrickable’i API võti](https://rebrickable.com/api/). Pärast komplekti valimist laadib rakendus vajalike detailide loendi koos värvide ja kogustega. Komplekti numbri (näiteks `60337`) saab ka käsitsi sisestada.
5. Üksikute osade tuvastamiseks laota kuni 15 klotsi üksteisest eraldi kontrastsele ühevärvilisele taustale. GitHub Pagesis vali esmalt komplekt. Rakendus märgib rohelise kastiga fotolt leitud klotsid, mille kuju ja hinnanguline värv vastavad veel puuduvale detailile. Arvesta, et valgustus võib värvituvastust mõjutada. FastAPI vaates vajuta „Skaneeri klotsid”.
6. Kontrolli pakutud detaili kuju ja värvi enne kogutuks märkimist. Kogused jäävad brauseri salvestusse.

Komplekti tuvastus annab võimalikud vasted. Lahtiste klotside või nummerdamata koti pildistamisel kasuta teadaolevat komplekti numbrit ja võrdle üksikuid klotse selle loendiga. Kui brauser ei suuda HEIC-fotot avada, proovi JPG- või PNG-faili.

Tuvastamisel saadetakse töödeldud foto Brickognize’ile. Rebrickable’i võti sisestatakse rakenduses ja säilib brauseris. GitHub Pages saadab võtme otse Rebrickable’ile ja FastAPI vaade vahendab päringu oma serveri kaudu.

## Kohalik käivitamine

```bash
pip install -r requirements.txt
uvicorn app:app --reload
```

Ava `http://localhost:8000`.

## Renderisse avaldamine

Loo [Renderis](https://dashboard.render.com/) uus **Blueprint** ja ühenda GitHubi hoidla `nightly-estonia/lego-sorter`. Render loeb `render.yaml` faili ning käivitab FastAPI veebiserveri. Tasuta teenuse plaani olemasolu ja tingimused sõltuvad Renderi hinnakirjast.

Kogumise andmed salvestatakse selle brauseri ja saidi jaoks.
