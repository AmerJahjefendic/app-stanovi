# AppStanovi – Project Context

## 1. Opšti opis
**AppStanovi** je web aplikacija (frontend-only) za praćenje **prihoda, troškova i provizija** za apartmane koji se kratkoročno iznajmljuju.

Aplikacija je namijenjena **realnoj upotrebi**, sa tačnim finansijskim obračunima, i koristi:
- Vanilla JavaScript (ES modules)
- HTML / CSS
- IndexedDB (lokalna baza)
- GitHub Pages za deployment

Nema backend-a i nema frameworka (React/Vue/etc).

---

## 2. Apartmani (core domain)
| Oznaka | Opis |
|------|------|
| A | Moj apartman |
| Z | Moj apartman |
| N | Apartman koji nije moj (radim proviziju) |

Za **A i Z** sav prihod je moj.  
Za **N** se radi raspodjela između vlasnika i mene.

---

## 3. Tehnologije
- **Frontend**: Vanilla JS (ES modules)
- **Storage**: IndexedDB
- **Deployment**: GitHub Pages
- **State**: ručno (shared/state.js)
- **Izvještaji**: reports/metrics.service.js

---

## 4. Struktura aplikacije

```text
/
├── index.html              # Home / Dashboard
├── income.html             # Prihodi
├── expenses.html           # Troškovi
├── css/
│   ├── app.css             # Glavni stilovi aplikacije
│   └── print.css           # Print / PDF stilovi
├── js/
│   ├── app/                # Home (dashboard)
│   │   ├── home.page.js
│   │   ├── home.data.js
│   │   ├── home.ui.js
│   │   └── home.events.js
│   ├── income/             # Prihodi
│   │   ├── income.page.js
│   │   └── income.ui.js
│   ├── expenses/           # Troškovi
│   │   ├── expenses.page.js
│   │   └── expenses.ui.js
│   ├── reports/            # Izračuni i metrike
│   │   └── metrics.service.js
│   ├── shared/             # Shared logika (KRITIČNO)
│   │   ├── constants.js
│   │   ├── utils.js
│   │   ├── ui.js
│   │   ├── state.js
│   │   ├── settings.js
│   │   ├── mappingConfig.js
│   │   ├── importXlsx.js
│   │   ├── parseFilename.js
│   │   ├── pdf.js
│   │   └── log.js
│   └── db/
│       └── db.js            # IndexedDB wrapper
└── .gitignore

5. IndexedDB – object stores
Store	Opis
imports	Evidencija importovanih perioda
income_monthly	Mjesečni prihodi (legacy/import)
income_items	Detaljne stavke prihoda
expenses	Troškovi
n_commission	Agregirani obračun za apartman N
category_aliases	Mapiranje kategorija troškova
6. CLEANING FEE (CF) – globalno pravilo

CF = 10 EUR

CF je uvijek moj prihod

CF ne ulazi u vlasnikov dio

CF se ne prikazuje vlasnicima (samo interno)

7. LOGIKA PRIHODA PO PLATFORMAMA (KRITIČNO)
7.1 Airbnb
Apartmani A i Z

Uneseni iznos = kompletan prihod

Apartman N

gross = uneseni iznos

airbnb_fee = (gross + CF) * 0.03

net_za_raspodjelu = gross - airbnb_fee

Raspodjela:

Vlasnik = 75% * net_za_raspodjelu

Ja = 25% * net_za_raspodjelu + CF

UI pravilo:

"Net nama" prikazuje samo moj dio bez CF

CF se ne prikazuje vlasniku

7.2 Booking.com
Svi apartmani

gross = iznos rezervacije

fee = booking fee (obavezno polje)

net_za_raspodjelu = gross - fee - CF

Apartmani A i Z

Cijeli net je moj prihod

Apartman N

Vlasnik = 75% * net_za_raspodjelu

Ja = 25% * net_za_raspodjelu + CF

7.3 VRBO

Unos se vrši u USD

Automatska konverzija u EUR na datum unosa

gross = USD * FX

net_za_raspodjelu = gross - CF

Raspodjela:

Vlasnik = 75%

Ja = 25% + CF

Napomena:

VRBO isplaćuje direktno na račun

Paid checkbox default = false

8. Paid status

Svaki income item ima paid boolean

Paid se može:

postaviti pri unosu

promijeniti naknadno u UI

Cilj: da nema dugotrajno neplaćenih stavki

9. Troškovi
9.1 Scope
Scope	Opis
SHARED	Dijeli se između A i Z
APARTMENT	Vezan za jedan apartman
9.2 Dijeljenje SHARED troškova

Pravilo dijeljenja:

po prihodu ili

po noćenjima

Pravilo se bira globalno (settings)

9.3 Prikaz

Tabela Troškovi po kategoriji

Tabela Troškovi po apartmanu

Lista stavki je default sakrivena

10. Home / Dashboard
KPI kartice

Prihod

Troškovi

Neto

Noćenja

Filteri

Mjesec / Godina / Period

Apartman

Platforma (prihodi)

Planned / In progress

Neto prosjek (average po mjesecima)

Troškovi prosjek = troškovi / prihod

Mora raditi za:

Year view

Range filter

Apt filter

11. Ograničenja i pravila

❌ Nema backend-a
❌ Nema frameworka
❌ Ne mijenjati postojeću poslovnu logiku bez dogovora
✅ Kod mora biti jasan, modularan i spreman za git commit
✅ Guardovi za null / undefined su obavezni

Ako nešto nije jasno → pitati prije implementacije.

12. Status projekta

Core logika stabilna

Sve platforme (Airbnb / Booking / VRBO) rade ispravno

Aktivno se koristi u produkciji

Fokus sada: UX + reporting + stabilnost

Arhitekturna pravila

❌ NEMA frameworka

❌ NEMA backend-a

✅ ES modules svuda

✅ page.js = orkestracija + state

✅ ui.js = render funkcije (bez biznis logike)

✅ metrics.service.js = SVA računica (single source of truth)

✅ shared/ je strogo bez DOM-a (osim ui.js)

## Pravila za AI asistenta
- Ne uvoditi frameworke
- Ne mijenjati strukturu foldera
- Ne duplicirati logiku iz metrics.service.js
- Prije izmjene UI-a objasniti šta se tačno mijenja