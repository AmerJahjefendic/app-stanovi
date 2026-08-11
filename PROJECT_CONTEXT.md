# AppStanovi – Project Context

> **Source of Truth za razvoj projekta AppStanovi.**
>
> Ovaj dokument opisuje trenutno stanje arhitekture, poslovna pravila, izvore podataka, compatibility slojeve i razvojne principe koje buduće izmjene moraju poštovati.
>
> Ako se dokument i implementacija razlikuju, prije izmjene prvo provjeriti stvarni kod i utvrditi da li je dokument zastario. Ne uvoditi novu paralelnu business logiku samo zato što nešto nije dokumentovano.

---

## 1. Trenutni status projekta

- **Repo:** `https://github.com/AmerJahjefendic/app-stanovi`
- **Glavna grana:** `main`
- **Trenutni release:** `v1.5.1`
- **Trenutna faza:** `v1.5.1 – Released`
- **Sljedeći planirani feature:** `v1.6.0 – Booking Calendar`
- **Deployment:** GitHub Pages
- **Arhitektura:** frontend-only PWA
- **Baza:** IndexedDB
- **Backend:** nema
- **Framework:** nema

### Završene velike arhitektonske promjene

- **v1.4.0 – Installable PWA**
- **v1.5.0 – Dynamic Apartments Integration**
- **Revenue Allocation by Stay** – implementiran i koristi stvarne datume boravka
- **Managed Financial Engine** – centralizovan
- **Airbnb Fee Model v2** – `SPLIT_FEE` + `SINGLE_FEE`
- **Income CRUD** – create / edit / delete
- **Expense CRUD** – create / edit / delete
- **Dynamic Apartment Registry** – integrisan kroz runtime module
- **Smart Shopping dynamic scopes** – integrisan
- **Backup / Restore v2** – validiran i atomaran restore

### Trenutni cilj

Prije razvoja Booking Calendara ne širiti scope. Fokus v1.5.1 je:

- stabilnost,
- regresije,
- uklanjanje stvarnih blokera,
- kontrolisani cleanup legacy slojeva samo kada donosi jasnu vrijednost.

### v1.5.1 stabilization status

- **Phase 1 – Test Safety Net:** implementirano, 27/27 testova prošlo prije Phase 2.
- **Phase 2 – Cleaning Fee model:** implementirano. SINGLE_FEE input semantics su zatim korigovane i zaključane testovima.
- **Phase 3 – Apartment Lifecycle:** implementirano. Registry sada razlikuje ACTIVE / INACTIVE / ARCHIVED, historical filteri zadržavaju pristup starim apartmanima, a hard delete je blokiran kada postoje istorijske reference.
- **Phase 3B – Home dynamic apartment regression fix:** uklonjen bezuslovni A/Z/N seed iz KPI/Home reportinga; fresh/dynamic baza sada prikazuje samo apartmane koji stvarno postoje u period/history podacima. Legacy A/Z/N ostaju podržani kada su stvarno prisutni u starim podacima. Legacy “Napomena za N” je skrivena kada nema `n_commission` zapisa.
- **Phase 4B – Privacy & Legacy Cleanup:** uklonjeni dokazano mrtvi legacy apartment metadata modeli i hardkodovani lični podaci iz `constants.js`; Settings placeholderi su neutralizovani; novi Income CRUD više ne rebuilda `n_commission`; `n_commission` ostaje isključivo legacy compatibility store za stare XLS/JSON podatke i legacy reporting fallback. Uklonjen je i mrtvi `computeNOwnerReport()` alias te development `console.log`.
- **Final Release Audit Hotfix:** uklonjen preostali `LEGACY_APARTMENTS` seed iz Year/Range reportinga koji je mogao izazvati `ReferenceError`; Home Owner Report sada za historical metadata koristi cijeli Apartment Registry (`apartmentsListAll`), pa INACTIVE/ARCHIVED MANAGED apartmani zadržavaju owner PDF podršku.
- **Final Fresh-State UI Hotfix:** legacy blok “Napomena za N” je inicijalno skriven u HTML-u i prikazuje se samo kada stvarni legacy `n_commission` podatak zahtijeva njegov prikaz. Fresh instalacija više ne prikazuje prazan N legacy panel.
- Ukupno nakon finalnih release hotfixeva: **56 regression testova**.
- v1.5.1 stabilization je završen; release gate je potvrđen sa 56/56 regression testova i završnim ručnim smoke testovima.
- **DB15 Timestamp Hardening:** timestamp polja su normalizovana, v15 backfill je jednokratan/awaited, legacy backup restore normalizuje timestamp shape, a test suite je proširen na 71/71.

---

## 2. Šta je AppStanovi

AppStanovi je web aplikacija za upravljanje finansijama i operativnim podacima apartmana za kratkoročni najam.

Glavne funkcije:

- prihodi po rezervacijama,
- troškovi,
- MANAGED obračun vlasnik / agencija,
- raspodjela prihoda po stvarnim noćenjima,
- periodični KPI izvještaji,
- Owner Report,
- PDF izvještaji,
- Smart Shopping / inventory,
- Settings i dinamički Apartment Registry,
- JSON backup / restore,
- PWA instalacija i update flow.

Aplikacija se koristi sa realnim finansijskim podacima. Tačnost podataka i backwards compatibility imaju prednost nad kozmetičkim refaktorisanjem.

---

## 3. Tehnologije

- **HTML**
- **CSS**
- **Vanilla JavaScript**
- **ES Modules**
- **IndexedDB**
- **Service Worker / PWA**
- **GitHub Pages**
- **SheetJS/XLSX** – legacy XLS migration/import alat

Nema React/Vue/Angular frameworka i nema server-side backend-a.

---

## 4. Arhitektonska pravila

Ova pravila važe za sav budući razvoj.

### 4.1 Business logic mora biti centralizovana

- UI ne smije implementirati finansijske formule.
- PDF ne smije implementirati finansijske formule.
- KPI ne smije imati paralelnu verziju MANAGED obračuna.
- Booking Calendar ne smije uvoditi novu finansijsku logiku.
- Dashboard 2.0 mora koristiti postojeće centralne servise i DTO-e.
- OCR treba završiti u postojećem Expense create toku, ne u zasebnom persistence modelu.

### 4.2 Istorijski podaci moraju ostati stabilni

Promjena trenutnog Settings-a ne smije retroaktivno mijenjati finansijski rezultat stare rezervacije ako je potreban snapshot već zapisan u `income_items`.

Primjeri:

- cleaning fee,
- agency share,
- owner share,
- fee model,
- platform fee,
- shared expense members.

### 4.3 Dynamic Apartments je runtime standard

Novi runtime kod ne smije pretpostavljati da portfolio čine `A`, `Z` i `N`.

`A/Z/N` su legacy identifikatori postojećih istorijskih podataka i compatibility sloja.

### 4.4 Ne refaktorisati samo radi stila

Ako je kod:

- jasan,
- stabilan,
- testiran,
- bez duplirane business logike,

ne mijenjati ga samo zato što postoji drugi način implementacije.

### 4.5 Null / undefined guardovi su obavezni

Posebno kod:

- prazne baze,
- legacy podataka,
- deaktiviranih apartmana,
- nepotpunih starih zapisa,
- podataka nakon restore-a.

---

## 5. Source of Truth

### Apartment Registry

**IndexedDB `apartments` store** + `js/shared/apartments.service.js`

To je glavni runtime izvor konfiguracije apartmana.

### Apartment groups / shared sets

- `groups` store
- `share_sets` store
- `apartments.service.js`

### Commission Rules

- `commission_rules` store
- `js/shared/commission-rules.service.js`

### MANAGED finansijski obračun pri unosu

`js/shared/managed-income-calculator.js`

### Finansijski snapshot i normalizacija rezervacije

`js/shared/reservation-financial.service.js`

### Revenue Allocation

`js/shared/stay-allocation.js`

### Income period DTO / prikaz

`js/shared/income-period-view.service.js`

### KPI / periodični reporting

`js/reports/metrics.service.js`

### Shared expense allocation

`js/shared/shared-expense-allocation.service.js`

### Smart Shopping scopeovi

`js/shared/shopping-scopes.service.js`

### Backup / Restore

`js/backup/backup.service.js`

### IndexedDB schema

`js/db/db.js`

### PWA verzija i cache lifecycle

- `js/shared/app-version.js`
- `js/pwa/pwa-client.js`
- `service-worker.js`

---

## 6. Glavna struktura aplikacije

```text
/
├── index.html
├── income.html
├── expenses.html
├── shopping.html
├── settings.html
├── manifest.webmanifest
├── service-worker.js
├── package.json             # Node test runner config; browser runtime ne zavisi od njega
│
├── tests/
│   ├── managed-cleaning-fee.test.js
│   ├── managed-income-calculator.test.js
│   ├── reservation-financial.test.js
│   ├── stay-allocation.test.js
│   └── shared-expense-allocation.test.js
│
├── css/
│   ├── app.css
│   └── print.css
│
├── js/
│   ├── app/
│   │   ├── home.page.js
│   │   ├── home.data.js
│   │   ├── home.ui.js
│   │   └── home.events.js
│   │
│   ├── income/
│   │   ├── income.page.js
│   │   └── income.ui.js
│   │
│   ├── expenses/
│   │   ├── expenses.page.js
│   │   └── expenses.ui.js
│   │
│   ├── shopping/
│   │   └── shopping.js
│   │
│   ├── settings/
│   │   ├── settings.page.js
│   │   ├── settings.ui.js
│   │   └── app-info.js
│   │
│   ├── reports/
│   │   └── metrics.service.js
│   │
│   ├── backup/
│   │   └── backup.service.js
│   │
│   ├── pwa/
│   │   └── pwa-client.js
│   │
│   ├── db/
│   │   └── db.js
│   │
│   └── shared/
│       ├── apartment-select.js
│       ├── apartments.service.js
│       ├── app-version.js
│       ├── commission-rules.service.js
│       ├── constants.js
│       ├── importXlsx.js
│       ├── income-period-view.service.js
│       ├── managed-income-calculator.js
│       ├── pdf.js
│       ├── record-timestamps.js
│       ├── reservation-financial.service.js
│       ├── shared-expense-allocation.service.js
│       ├── shopping-scopes.service.js
│       ├── stay-allocation.js
│       ├── settings.js
│       ├── state.js
│       ├── ui.js
│       └── utils.js
```

---

## 7. Apartment Registry

### 7.1 Model apartmana

Apartment Registry podržava dinamičko dodavanje apartmana kroz Settings.

Glavna polja uključuju:

- `id`
- `name`
- `groupId`
- `ownerType`
- `agencyPct`
- `isActive`
- `sort`
- `shareKey`
- `ownerName`
- `address`
- timestamps / legacy metadata gdje postoji

### 7.2 Owner types

```text
OWNED
MANAGED
```

**OWNED** – prihod pripada korisniku aplikacije.

**MANAGED** – prihod se dijeli između vlasnika i agencije prema snapshotu/rule-u.

### 7.3 Grupe

Sistemske kategorije trenutno uključuju:

- `AZ` → Shared
- `O` → Solo
- legacy `N` → Managed compatibility kod postojećih baza

Novi korisnik ne dobija portfolio-specifične A/Z/N apartmane automatski.

### 7.4 Shared apartments

Shared apartmani koriste `shareKey` i `share_sets`.

Shared trošak mora imati stabilan snapshot članova kada se snima, kako promjena registry-ja kasnije ne bi promijenila istorijsku raspodjelu.

### 7.5 Apartment ID

Apartment ID treba tretirati kao stabilni identifikator.

Ne planirati rename ID-a kao običan Settings edit bez migracije svih istorijskih referenci.

### 7.5.1 Home / KPI dynamic apartment rule [FIXED v1.5.1 Phase 3B]

Home/KPI reporting ne smije bezuslovno seedovati legacy `A/Z/N` apartmane.

Pravila:

- fresh install sa dinamičkim apartmanom npr. `S` prikazuje samo stvarne apartmane iz podataka,
- A/Z/N se pojavljuju samo kada stvarno postoje u istorijskim/legacy podacima,
- `n_commission`-only legacy snapshot i dalje može eksplicitno kreirati N red radi kompatibilnosti,
- UI ne prikazuje legacy “Napomena za N” kada nema `n_commission` podatka.

Ovo sprječava fantomske A/Z/N redove na Index/Home stranici nove aplikacije.

### 7.6 Apartment lifecycle [IMPLEMENTED v1.5.1 Phase 3]

Registry koristi lifecycle semantiku:

```text
ACTIVE
INACTIVE
ARCHIVED
```

Polje `lifecycleStatus` je novi eksplicitni status. Legacy `isActive` se i dalje održava radi backward compatibility-ja:

- `ACTIVE` → `isActive: true`
- `INACTIVE` → `isActive: false`
- `ARCHIVED` → `isActive: false`

Postojeći backup/DB zapisi bez `lifecycleStatus` ne zahtijevaju destruktivnu migraciju: `isActive !== false` se tretira kao `ACTIVE`, a `isActive === false` kao `INACTIVE`.

Semantika:

- **ACTIVE** – dostupan za nove Income/Expense operativne unose i Smart Shopping scopeove.
- **INACTIVE** – privremeno van novih unosa, ali ostaje vidljiv u Settingsu i istorijskim filterima.
- **ARCHIVED** – dugoročno uklonjen iz svakodnevnog Settings/operativnog prikaza, ali registry zapis i istorijski kontekst ostaju sačuvani.

Settings po defaultu skriva `ARCHIVED` zapise. Korisnik ih može prikazati opcijom **Prikaži arhivirane**. Arhivirani apartman može se vratiti (`Restore`) kao `INACTIVE`, nakon čega se po potrebi ponovo aktivira.

Historical apartment filteri (Home/Income/Expenses/reporting) uključuju ACTIVE, INACTIVE i ARCHIVED apartmane, uz status oznaku za neaktivne/arhivirane. Novi-entry selecti ostaju ACTIVE-only.

Smart Shopping namjerno ne prikazuje scopeove INACTIVE/ARCHIVED apartmana. Njihovi sačuvani shopping podaci ostaju u bazi/backup-u i ne smiju se pogrešno prikazivati kao orphan `Legacy lista`.

### 7.7 Delete pravilo [IMPLEMENTED v1.5.1 Phase 3]

Hard delete je samo cleanup za apartman koji nema podatke.

Prije fizičkog brisanja provjeravaju se reference u:

- `income_items`,
- `income_monthly`,
- `expenses` (uključujući `sharedMembers` snapshot),
- direktnim `shopping_items` scopeovima.

Ako postoji ijedna reference, delete se blokira i korisnik se upućuje na arhiviranje. Aktivan apartman se svakako mora prvo deaktivirati.

Ako nema istorijskih/data referenci, hard delete je dozvoljen i uklanjaju se i apartment-specific `commission_rules` zapisi kako ne bi ostala orphan konfiguracija.

---

## 8. Income model

Glavni detaljni store je:

```text
income_items
```

`income_monthly` je legacy/agregirani store koji postoji radi istorijske kompatibilnosti/importovanih podataka.

### 8.1 Income CRUD

Podržano:

- create,
- edit,
- delete,
- paid toggle,
- check-in / check-out,
- platform,
- apartment,
- MANAGED financial snapshot.

### 8.2 Paid status

Income item ima `paid` boolean.

Može se postaviti pri unosu i mijenjati naknadno.

### 8.3 Platforme

Centralne vrijednosti:

```text
airbnb
booking
vrbo
direct
other
```

Definisane su u `constants.js` kao `Platforms`.

---

## 9. Revenue Allocation by Stay

Revenue Allocation je **implementiran i produkcijski standard**.

Mjesečni prikaz detaljne rezervacije više ne knjiži kompletan prihod samo u check-in mjesec.

Primjer:

```text
31.07 → 07.08

Juli:   1 noćenje
August: 6 noćenja
```

Finansijski iznos se raspoređuje proporcionalno stvarnim noćenjima.

Centralni servis:

```text
js/shared/stay-allocation.js
```

Finansijski input priprema:

```text
js/shared/reservation-financial.service.js
```

### Pravila

- ne duplicirati allocation logiku,
- ne računati mjesečni prihod ponovo u UI-ju,
- ne vraćati se na check-in-month-only model,
- raspodjela novca mora očuvati ukupni finansijski iznos i cent rounding.

Legacy agregirani podaci bez stvarnih stay datuma ostaju legacy podaci i ne treba im izmišljati datume.

---

## 10. MANAGED Financial Engine

MANAGED obračun je centralizovan u:

```text
js/shared/managed-income-calculator.js
```

Kasniji reporting koristi finansijski snapshot kroz:

```text
js/shared/reservation-financial.service.js
```

### 10.1 Default share

Standardni default:

```text
Owner:  75%
Agency: 25%
```

Stvarni procenat za dinamički MANAGED apartman može biti definisan kroz njegovu konfiguraciju/snapshot.

### 10.2 Cleaning Fee

Cleaning Fee je prihod agencije i ne prikazuje se kao vlasnikov prihod.

Svaka rezervacija čuva efektivni `cleaningFeeEur` kao **istorijski snapshot**. Promjena Settings-a kasnije ne smije retroaktivno mijenjati staru rezervaciju.

#### Trenutno stanje v1.5.0

Za nove MANAGED rezervacije Booking, VRBO i Direct/Other već koriste konfigurirani CF koji se trenutno dohvaća preko postojećeg MANAGED/Commission Rules configuration toka. Airbnb `SINGLE_FEE` također koristi konfigurirani CF.

Airbnb legacy `SPLIT_FEE` je namjerno zaključan na **10 EUR**.

#### v1.5.1 Phase 2 – Cleaning Fee model [IMPLEMENTED]

Jedan globalni CF po apartmanu nije dovoljan jer platforme mogu imati različite potrebe. Implementirani model je:

```text
MANAGED apartment
  defaultCleaningFeeEur

  optional platform overrides
    Airbnb SINGLE_FEE
    Booking
    VRBO
    Direct
    Other
```

Efektivni CF za novi unos treba se rješavati hijerarhijom:

```text
platform override -> ako ne postoji, apartment default CF
```

Primjer:

```text
Default CF:                 10 EUR
Airbnb SINGLE_FEE override: 15 EUR
Booking override:            -
VRBO override:               -
Direct override:             -
```

Implementacija koristi postojeći `commission_rules` store bez nove DB migracije:

- apartment default CF se čuva kao `CLEANING_FEE_DEFAULT` rule,
- Booking/VRBO/Direct/Other overridei se čuvaju kao platform-specific Cleaning Fee rules,
- postojeći Airbnb `SINGLE_FEE` rule ostaje vlasnik Airbnb-specific overridea i 15.5% platform fee konfiguracije,
- postojeći v1.5.0 Airbnb Single Fee CF se automatski interpretira kao Airbnb override,
- ako apartment default rule još ne postoji, compatibility default je 10 EUR.

Airbnb `SPLIT_FEE` ostaje izuzetak i za sada ne koristi override/default hijerarhiju.

### 10.3 Airbnb fee modeli

```text
SPLIT_FEE
SINGLE_FEE
```

Novi MANAGED Airbnb unos defaulta na `SINGLE_FEE`, ali trenutni UI još dozvoljava izbor `SPLIT_FEE` radi legacy rezervacija.

### Planirana deprecacija SPLIT_FEE opcije

`SPLIT_FEE` više nije dugoročni produkcijski model. Kada više ne bude novih rezervacija koje ga koriste:

- ukloniti `SPLIT_FEE` iz UI izbora za **nove** rezervacije,
- novi Airbnb MANAGED unos uvijek koristiti `SINGLE_FEE`,
- **ne brisati** podršku za istorijske `feeModel: "SPLIT_FEE"` zapise,
- stare SPLIT_FEE rezervacije moraju i dalje raditi u edit/report/PDF/Revenue Allocation tokovima,
- fiksni legacy CF od 10 EUR ostaje dio compatibility enginea dok god postoje istorijski SPLIT_FEE zapisi.

#### Airbnb SPLIT_FEE – legacy

Postoje dva podržana calculator toka, zavisno od ulaza.

Za historical payout workflow:

```text
payout uključuje CF
CF = 10 EUR
splitBase = payout - CF
platformFee se ne rekonstruira iz payouta
```

Za gross calculator workflow:

```text
CF = 10 EUR
platformFee = (gross + CF) × 3%
payout = gross + CF - platformFee
splitBase = gross - platformFee
```

Raspodjela:

```text
ownerAmount  = splitBase × ownerShare
agencyAmount = splitBase × agencyShare + CF
```

#### Airbnb SINGLE_FEE

`gross` / uneseni iznos je **ukupna Airbnb cijena rezervacije koja već uključuje Cleaning Fee**. CF se ne dodaje drugi put.

```text
platformFee = gross × 15.5%
payout      = gross - platformFee
splitBase   = payout - CF

ownerAmount  = splitBase × ownerShare
agencyAmount = splitBase × agencyShare + CF
```

CF dolazi iz konfiguracije MANAGED apartmana / Commission Rule-a i snapshotuje se u rezervaciju.

Primjer: Airbnb total 115 EUR, CF 15 EUR → platform fee = 17.825 EUR, payout = 97.175 EUR, splitBase = 82.175 EUR. CF se **ne dodaje** na 115 EUR.

**Compatibility napomena:** ova korekcija ne radi automatski rewrite postojećih SINGLE_FEE `income_items`, jer se iz legacy zapisa ne može pouzdano zaključiti da li je korisnik ranije unosio total sa CF-om ili iznos bez CF-a. Postojeći finansijski snapshotovi ostaju netaknuti dok se rezervacija eksplicitno ne edituje/sačuva.

### 10.4 Booking.com – MANAGED

```text
payout    = gross - platformFee
splitBase = payout - CF

ownerAmount  = splitBase × ownerShare
agencyAmount = splitBase × agencyShare + CF
```

Booking fee je eksplicitni input.

### 10.5 VRBO – MANAGED

```text
gross EUR = USD amount × USD→EUR FX
platformFee = 0
payout = gross EUR
splitBase = payout - CF

ownerAmount  = splitBase × ownerShare
agencyAmount = splitBase × agencyShare + CF
```

### 10.6 Direct / Other

Direct/Other MANAGED tok mora koristiti spremljeni split-base snapshot i ne smije ponovo dodavati CF u owner osnovicu.

### 10.7 Snapshot pravilo

Kada se rezervacija snimi, relevantni finansijski parametri moraju ostati istorijski stabilni.

Promjena Settings-a kasnije ne smije promijeniti rezultat stare rezervacije.

---

## 11. Commission Rules

Centralni servis:

```text
js/shared/commission-rules.service.js
```

Store:

```text
commission_rules
```

Servis podržava:

- normalizaciju fee modela,
- lookup rule-a,
- apartment/platform konfiguraciju,
- Airbnb SINGLE_FEE rule,
- legacy fallback gdje je potreban.

Ne uvoditi drugi Commission Rules sistem.

Legacy rule `N_AIRBNB_DEFAULT` postoji samo radi kompatibilnosti starih baza/podataka.

---

## 12. Expenses

Store:

```text
expenses
```

Podržano:

- create,
- edit,
- delete,
- kategorije,
- category aliases,
- APARTMENT expense,
- SHARED expense,
- dynamic apartments,
- dynamic shared sets.

### 12.1 Scope

```text
APARTMENT
SHARED
SHARED_SPLIT
```

### 12.2 Shared allocation

Centralna logika:

```text
js/shared/shared-expense-allocation.service.js
```

Shared rule može biti:

```text
INCOME
NIGHTS
```

Globalni izbor se čuva u Settings/local storage sloju.

### 12.3 Snapshot shared members

Novi shared expense treba koristiti zapisani `shareKey` i snapshot članova grupe.

Cilj: buduća promjena Apartment Registry-ja ne smije retroaktivno promijeniti istorijsku raspodjelu troška.

Legacy shared expenses bez snapshot-a mogu imati compatibility fallback za stari A+Z model.

---

## 13. Reporting

### 13.1 Periodi

Podržano:

- Month
- Year
- Range

### 13.2 Filteri

- period,
- apartment,
- platform gdje je primjenjivo.

### 13.3 KPI

Glavni reporting servis:

```text
js/reports/metrics.service.js
```

KPI koristi Revenue Allocation za detaljne rezervacije sa stay periodom.

Ne uvoditi paralelnu finansijsku formulu u Dashboard.

### 13.4 Income period view

Centralni DTO/view servis:

```text
js/shared/income-period-view.service.js
```

### 13.5 Owner Reports

Owner Report mora koristiti centralni finansijski snapshot/DTO.

Vlasniku se ne prikazuje CF kao njegov prihod.

Agency commission se ne smije računati preko zasebne PDF formule.

### 13.6 PDF

PDF je presentation/output sloj.

Ne smije postati novi source of truth za finansije.

PDF footer ne treba prikazivati browser URL.

---

## 14. Smart Shopping

Store:

```text
shopping_items
```

Centralni scope servis:

```text
js/shared/shopping-scopes.service.js
```

Podržano:

- inventory po apartmanu,
- shared inventory,
- dynamic apartment scopes,
- dynamic shared scopes,
- `IN_STOCK`,
- `TO_BUY`,
- qty/unit gdje je uneseno,
- backup / restore.

### Storage scope format

Novi dinamički scopeovi koriste namespaced ključeve tipa:

```text
APT:<apartmentId>
SHARE:<shareKey>
```

Legacy `AZ` / `N` vrijednosti mogu ostati compatibility sloj za postojeće podatke.

---

## 15. Backup / Restore

Centralni servis:

```text
js/backup/backup.service.js
```

### Trenutni format

```text
BACKUP_FORMAT_VERSION = 2
DATA_SCHEMA_VERSION   = 1
```

Backup je JSON.

### Pravila

- ne smije se napraviti uspješan backup sa tihim izostavljanjem store-a,
- restore mora validirati strukturu,
- key path mora postojati,
- dupli primarni ključevi se odbijaju,
- restore upis koristi atomarnu multi-store transakciju,
- current i podržani legacy backup formati se normalizuju prije upisa.

### Restore semantika

Trenutni restore:

```text
DODAJE / PREPISUJE zapise iz backupa.
Ne briše postojeće podatke koji nisu prisutni u backupu.
```

Ovo ponašanje ne mijenjati bez eksplicitne odluke.

---

## 16. IndexedDB

### Database

```text
DB_NAME = appstanovi_db
DB_VER  = 15
```

### Current stores

| Store | Namjena |
|---|---|
| `apartments` | Dynamic Apartment Registry |
| `groups` | Apartment groups / system categories |
| `share_sets` | Shared apartment clusters |
| `commission_rules` | MANAGED / platform rules |
| `meta` | schema metadata |
| `shopping_items` | Smart Shopping |
| `category_aliases` | Expense category merge aliases |
| `imports` | Legacy XLS import evidencija |
| `income_monthly` | Legacy/import monthly aggregates |
| `income_items` | Detaljne rezervacije / prihodi |
| `expenses` | Troškovi |
| `n_commission` | Legacy N aggregated commission compatibility |

### Fresh install

Fresh install ne seeduje korisnički portfolio A/Z/N.

Seeduje samo generičke sistemske strukture potrebne da korisnik može napraviti prvi apartman.

### Existing legacy database upgrade

Stara baza dobija A/Z/N i potrebne legacy strukture samo da postojeće istorijske reference ostanu validne.

### Migrations

Migracije moraju biti:

- idempotentne po efektu,
- backwards compatible,
- bez retroaktivne promjene istorijskih finansija.

DB14 uključuje legacy Airbnb `feeModel` compatibility migraciju: zapisi bez `feeModel` tretiraju se kao `SPLIT_FEE`.

DB15 uvodi normalizaciju timestamp polja za istorijske zapise. `income_items`, `income_monthly`, `expenses`, `shopping_items`, `category_aliases` i `n_commission` koriste camelCase `createdAt` / `updatedAt`. Novi `category_aliases` write path također čuva originalni `createdAt` pri upsertu i osvježava samo `updatedAt`, tako da novi aliasi ne vraćaju timestamp nekonzistentnost nakon završene migracije. Migracija je jednokratna, završava se prije nego `getDB()` učini konekciju dostupnom aplikaciji i zapisuje `meta` marker `migration:v15:timestamps`, tako da se storeovi ne skeniraju pri svakom startu. Ako legacy zapis ima creation timestamp ali nema update timestamp, `updatedAt` nasljeđuje creation timestamp umjesto datuma migracije.

Restore starog JSON backupa normalizuje timestamp polja na restore granici, tako da jednokratna DB15 migracija ne mora ponovo skenirati bazu nakon restore-a. `imports.imported_at` ostaje namjerni semantički izuzetak jer predstavlja vrijeme importa, a ne generički record `createdAt`.

---

### 16.1 Record timestamps – DB15 hardening

Shared helper:

```text
js/shared/record-timestamps.js
```

Koristi se za nove/izmijenjene Income i Expense zapise, bulk XLSX write tokove, restore normalizaciju i DB15 legacy backfill. Established registry/configuration servisi mogu i dalje direktno održavati vlastite camelCase timestampove; helper nije jedino mjesto u cijelom projektu koje smije postaviti `createdAt` / `updatedAt`.

Pravila:

- novi generički record timestampovi koriste camelCase `createdAt` / `updatedAt`,
- legacy `created_at` / `updated_at` se normalizuju na migration/restore granici,
- partial legacy zapis sa poznatim creation timestampom ne dobija lažni `updatedAt` jednak datumu migracije,
- DB15 backfill se izvršava jednom i označava `meta` markerom,
- restore starog backupa ponovo normalizuje legacy timestamp shape bez potrebe za ponovnim full-store scanom,
- `imports.imported_at` je namjerni semantički izuzetak.

---

## 17. PWA

### Release metadata

```text
APP_VERSION        = 1.5.1
APP_SHELL_REVISION = 2
```

Source:

```text
js/shared/app-version.js
```

### Service Worker

```text
service-worker.js
```

Principi:

- app shell je verzioniran,
- critical precache failure treba oboriti install nove SW verzije,
- stari AppStanovi cachevi se čiste tokom lifecycle-a,
- novi service worker ne smije nasilno preuzeti kontrolu usred aktivnog editovanja,
- update flow koordinira UI i service worker state.

### PWA client

```text
js/pwa/pwa-client.js
```

Update flow mora ostati svjestan aktivnih editora / više tabova gdje je to već implementirano.

---

## 18. Legacy XLS Import

Fajlovi:

```text
js/shared/importXlsx.js
js/shared/mappingConfig.js
js/shared/parseFilename.js
vendor/xlsx.full.min.js
```

### Status

**Legacy / deprecated migration workflow.**

XLS importer je napravljen za istorijski, strogo definisan korisnički format `Troškovnik Mjesec Godina.xlsx` i nije zamišljen kao general-purpose produkcijski Excel importer za druge korisnike.

Svi potrebni istorijski podaci su već migrirani u aplikaciju i mogu se čuvati/prenositi kroz JSON Backup/Restore.

### Produkcijska odluka

Ne ulagati u proširenje XLS importera bez nove eksplicitne potrebe.

Prije finalne javne/produkcijske verzije može biti uklonjen ako se potvrdi da nema više runtime zavisnosti.

### Poznata audit napomena

Legacy XLS put može imati različit autoritativni rezultat između detaljnih `income_items` i N agregata iz starog `Apt N` sheet-a.

Pošto XLS više nije planirani produkcijski workflow, ovo se tretira kao legacy tehnički dug, ne kao blocker za Booking Calendar.

---

## 19. Legacy Compatibility Layer

Postojeći compatibility elementi nisu automatski bug.

### Namjerno podržano

- stari JSON backup format,
- postojeće A/Z/N istorijske reference,
- legacy Airbnb zapisi bez `feeModel`,
- legacy shared expenses,
- legacy shopping scopes,
- `income_monthly` za stare agregate,
- potrebni compatibility aliasi u PDF/UI sloju.

### Legacy / kandidat za postepeno uklanjanje

- XLS import workflow,
- `n_commission` store kao read-only legacy compatibility snapshot za stare XLS/JSON podatke,
- A/Z/N specifični helperi koji još imaju dokazanu compatibility funkciju.

U Phase 4B uklonjeni su dokazano mrtvi `APT_ROLE`, `APT_LIST`, `APT_FILTERS`, `APARTMENT_DEFS`, `APARTMENT_META` modeli. Novi Income CRUD više ne proizvodi niti rebuilda `n_commission`. Store, backup/restore i legacy reporting fallback ostaju zbog backwards compatibility.

Cleanup raditi samo nakon provjere stvarnih importova/poziva.

---

## 20. Automated regression test safety net

U v1.5.1 stabilization fazi uveden je prvi automatizovani regression test sloj za čistu finansijsku/domain logiku.

### Test runner

Koristi se ugrađeni Node.js test runner bez dodatnih npm dependency-ja.

Pokretanje:

```bash
npm test
```

`package.json` koristi ES module mode samo za Node test okruženje. Browser/GitHub Pages runtime aplikacije ostaje nepromijenjen.

### Trenutni test coverage

Uveden je regression safety net koji nakon finalnih release hotfixeva sadrži **71 test** i pokriva:

- Airbnb `SPLIT_FEE` payout legacy tok,
- Airbnb `SPLIT_FEE` gross/3% legacy calculator,
- Airbnb `SINGLE_FEE` 15.5% tok nad ukupnim iznosom koji već uključuje CF (uz eksplicitnu zaštitu od dvostrukog dodavanja CF-a),
- Booking MANAGED,
- VRBO MANAGED + FX,
- custom owner/agency procente,
- persisted financial snapshot reconstruction,
- Cleaning Fee snapshot ponašanje,
- MANAGED default Cleaning Fee fallback,
- Airbnb SINGLE_FEE Cleaning Fee override,
- Booking platform-specific Cleaning Fee override,
- VRBO/Direct/Other fallback na apartment default,
- locked Airbnb SPLIT_FEE CF=10 bez obzira na Settings,
- legacy N MANAGED fallback,
- Direct/Other split-base reconstruction,
- Revenue Allocation preko granice mjeseca,
- Revenue Allocation preko granice godine,
- cent rounding bez gubitka totala,
- legacy month fallback,
- shared expense members snapshot,
- A+Z legacy shared fallback,
- shared allocation po prihodu,
- shared allocation po noćenjima,
- zero-basis equal split,
- očuvanje ukupnog iznosa kod floating remainder-a,
- legacy `isActive` → lifecycle status kompatibilnost,
- ACTIVE/INACTIVE/ARCHIVED status semantiku,
- skrivanje arhiviranih apartmana iz normalnog Settings prikaza,
- delete-reference detekciju za prihode, troškove, shared member snapshotove i direct shopping scopeove,
- hard-delete eligibility kada nema zavisnih podataka,
- fresh-state legacy N note visibility (panel je inicijalno skriven bez `n_commission` podatka),
- zabranu ponovnog uvođenja hardkodovanih legacy apartment metadata konstanti sa ličnim podacima,
- granicu da novi Income CRUD ne piše `n_commission`, dok DB/backup/reporting legacy compatibility ostaje,
- uklanjanje mrtvog `computeNOwnerReport()` aliasa uz očuvanje generičkog `computeOwnerReport()`.

### Testing pravilo za budući razvoj

Prije promjene MANAGED Financial Enginea, Commission Rulesa, Cleaning Fee rezolucije, Revenue Allocationa ili shared expense alokacije:

1. postojeći testovi moraju biti zeleni,
2. novi business scenario prvo dobija regression test,
3. zatim se radi minimalna implementacijska izmjena,
4. promjena očekivanih finansijskih rezultata zahtijeva eksplicitnu business odluku, ne samo "popravku testa".

Ovi testovi trenutno ne pokrivaju DOM, IndexedDB migracije, PWA ili end-to-end UI tokove. To nije cilj prve stabilization faze.

---

## 21. Poznati stabilization nalazi poslije v1.5.0

Ovo nisu zahtjevi za novi feature; ovo su nalazi koje treba uzeti u obzir prije/uz v1.6.0.

### High – automated test gap [PHASE 1 ADDRESSED]

Prije v1.5.1 nije postojao automatizovani test suite za finansijski core.

v1.5.1 stabilization + timestamp hardening sada ima 71 regression test. Ovo značajno smanjuje rizik budućih finansijskih, registry i legacy-boundary regresija, ali ne zamjenjuje kompletne UI/IndexedDB/PWA end-to-end testove.

### High/Medium – privacy u legacy `APARTMENT_DEFS` [PHASE 4B ADDRESSED]

Dokazano mrtvi `APARTMENT_DEFS`, `APARTMENT_META`, `APT_ROLE`, `APT_LIST` i `APT_FILTERS` uklonjeni su iz runtime konstanti zajedno sa hardkodovanim ličnim imenima/adresama. Settings placeholderi koriste neutralne primjere. Nije mijenjana aktivna Apartment Registry konfiguracija.

### Medium – duplicated financial defaults

`managed-income-calculator.js` i `reservation-financial.service.js` imaju odvojene odgovornosti i ne treba ih spajati, ali trenutno mogu ponavljati fallback business default vrijednosti poput 10 EUR i 75/25.

Ne raditi veliki refactor. Nakon test safety net-a, eventualno centralizovati samo zajedničke default konstante ako to smanjuje stvarni rizik bez promjene formula.

### High – historical filters vs inactive apartments [PHASE 3 ADDRESSED]

New-entry selecti su ACTIVE-only, dok historical filteri zadržavaju INACTIVE/ARCHIVED apartmane. Arhivirani zapisi su po defaultu skriveni iz Settings liste, ali nisu izgubljeni iz istorijskog reportinga.

### High – delete apartment with history [PHASE 3 ADDRESSED]

Hard delete sada provjerava zavisne income/expense/shopping podatke i blokira brisanje ako istorija postoji. Za dugoročno uklanjanje iz operativnog UI-ja koristi se ARCHIVED status.

### Medium – `n_commission` [PHASE 4B ADDRESSED]

`n_commission` je formalno ograničen na legacy compatibility. Novi Income create/edit/delete više ga ne proizvodi niti rebuilda.

Store se i dalje čuva u IndexedDB, backup/restore podršci i legacy XLS/reporting fallbacku da postojeći istorijski podaci ostanu čitljivi.

Novi dinamički MANAGED reporting koristi `income_items` financial snapshot + `reservation-financial.service.js`; `n_commission` se ne smije koristiti kao novi source of truth.

### Medium – Settings atomicity

Apartment save i MANAGED commission-rule save mogu biti odvojeni DB writeovi.

Ako se ovaj dio bude dirao, cilj je spriječiti parcijalno snimljenu konfiguraciju bez promjene Commission Rules business logike.

### Low – legacy naming

Nazivi poput `nBreakdown`, `nCommission`, A/Z/N helperi i slični compatibility nazivi nisu prioritet sami po sebi.

Ne raditi mass rename u stabilization fazi.

---

## 22. Performance pravilo

Trenutno nije potvrđen performance blocker.

Ne uvoditi kompleksni cache/state/render sistem samo zbog potencijalne buduće optimizacije.

Optimizovati tek kada postoji mjerljiv problem, npr.:

- mnogo rezervacija u Booking Calendaru,
- spor periodični Dashboard 2.0,
- dokazani višestruki IndexedDB hot-path upiti,
- velika DOM rekonstrukcija koja se može izmjeriti.

---

## 23. Spremnost za naredne module

### v1.6.0 – Booking Calendar

Arhitektonski spremno uz poštivanje pravila:

- koristi Apartment Registry,
- koristi postojeći `income_items` reservation model gdje je moguće,
- ne duplicira Revenue Allocation,
- ne duplicira finansijske formule,
- mora ispravno prikazati istorijske/deaktivirane apartmane,
- legacy import stavkama bez stvarnih datuma ne izmišljati stay period.

### Dashboard 2.0

Mora koristiti:

- centralne period DTO-e,
- `metrics.service.js`,
- dynamic apartment aggregation,
- reservation financial snapshot.

Ne koristiti `n_commission` kao novi source of truth.

### OCR

OCR treba biti input pomoć za Expense workflow.

Nakon ekstrakcije korisnik potvrđuje relevantna polja, a zapis ide kroz postojeći Expense create/persistence tok.

OCR ne smije praviti paralelan expense store ili paralelnu kategorijsku logiku.

---

## 24. Development discipline

Prije veće izmjene:

1. pregledati kompletan relevantni tok,
2. utvrditi postojeći Source of Truth,
3. provjeriti legacy compatibility,
4. ne pretpostavljati kako nešto radi,
5. ne uvoditi duplicate business logic,
6. napraviti minimalnu izmjenu,
7. pokrenuti `npm test` i dodati regression test za izmijenjeni business scenario,
8. testirati praznu bazu i postojeću bazu,
9. testirati backup/restore uticaj ako schema/persistence bude dirana,
10. ažurirati `PROJECT_CONTEXT.md` kada se promijeni arhitektonska činjenica.

### Git pravilo

Kod treba ostati:

- modularan,
- čitljiv,
- spreman za mali i jasan commit,
- bez nepotrebnog scope creep-a.

---

## 25. Šta ne treba raditi bez eksplicitne odluke

- uvoditi backend,
- uvoditi framework,
- mijenjati finansijske formule,
- mijenjati Revenue Allocation,
- mijenjati Commission Rules semantiku,
- retroaktivno preračunavati istorijske rezervacije prema novim Settings vrijednostima,
- hardkodirati nove apartmane,
- vraćati A/Z/N kao runtime portfolio model,
- mijenjati restore u destructive replace bez eksplicitne odluke,
- proširivati legacy XLS importer kao novi produkcijski feature,
- uvoditi novi DTO kada postojeći centralni DTO već pokriva potrebu.

---

## 26. Sažetak arhitekture

```text
Settings
   │
   ├── Apartment Registry ──────────────┐
   │                                   │
   ├── Commission Rules                │
   │                                   │
   ▼                                   ▼
Income create/edit ──► Managed Financial Engine
   │                         │
   │                         ▼
   └────────────────► income_items snapshot
                              │
                              ▼
                reservation-financial.service
                              │
                              ▼
                     stay-allocation.js
                              │
                  ┌───────────┴───────────┐
                  ▼                       ▼
       income-period-view           metrics.service
                  │                       │
                  ▼                       ▼
             Income UI             Dashboard / Reports
                                          │
                                          ▼
                                     Owner Report
                                          │
                                          ▼
                                         PDF

Expenses ──► shared-expense-allocation ──► Reporting

Apartment Registry ──► shopping-scopes ──► Smart Shopping

IndexedDB stores ──► backup.service ──► JSON Backup / Restore

app-version + pwa-client + service-worker ──► PWA lifecycle
```

---

## 27. Dokumentacioni status

Ovaj `PROJECT_CONTEXT.md` odgovara stanju nakon:

- v1.4.0 Installable PWA,
- v1.5.0 Dynamic Apartments Integration,
- Revenue Allocation implementacije,
- Airbnb Fee Model v2,
- v1.5.1 Stabilization & Audit pregleda,
- Phase 1 automated regression test safety net-a,
- Phase 2 Cleaning Fee modela: default + platform override, uz korigovanu SINGLE_FEE input semantiku,
- Phase 3 Apartment Lifecycle modela: ACTIVE / INACTIVE / ARCHIVED + delete protection,
- ukupno 71 regression test,
- planirane deprecacije SPLIT_FEE opcije za nove rezervacije uz očuvanje historical compatibility-ja.

v1.5.1 Stabilization & Audit release gate je potvrđen sa 56/56 regression testova i završnim ručnim smoke testovima. Naknadni DB15 timestamp hardening proširuje safety net na 71/71 testova.

**Current release: `v1.5.1`.**
