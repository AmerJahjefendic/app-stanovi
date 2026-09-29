# AppStanovi — upute za Codex

Ovaj repozitorij je **privatna aplikacija AppStanovi**. Komercijalni `PropertyManagement` je drugi projekat i njegove odluke se ne prenose ovdje automatski.

## Prije rada

1. Pročitaj `PROJECT_CONTEXT.md`, zatim pregledaj relevantni kod i testove. Kod i testovi potvrđuju trenutno ponašanje; ako dokument odstupa, prijavi razliku i ažuriraj dokument tek nakon provjere.
2. Provjeri `git status` prije izmjena. Sačuvaj sve postojeće korisnikove izmjene; ne vraćaj ih i ne uključuj slučajno u svoj diff.
3. Definiši mali, jasan opseg zadatka. Pitaj samo kada stvarna poslovna odluka nedostaje.

## Pravila implementacije

- HTML/CSS/vanilla JS, ES modules, IndexedDB i PWA su postojeći stack. Ne uvodi framework, backend ili plaćeni servis bez odluke korisnika.
- Finansijski obračun, raspodjelu boravka i izvještaje mijenjaj u njihovim centralnim servisima, ne kroz dodatne formule u UI-ju ili PDF-u.
- Novi runtime mora koristiti dinamički Apartment Registry. A/Z/N se podržavaju zbog stvarnih starih podataka; prazna baza ne dobija fantomske apartmane.
- Sačuvaj istorijske finansijske snapshotove, legacy `SPLIT_FEE`, kompatibilnost IndexedDB migracija i JSON restore semantiku. Ne preračunavaj stare rezervacije prema današnjim postavkama.
- `SINGLE_FEE` za MANAGED Airbnb prima ukupnu cijenu koja već uključuje CF. CF ne dodavati drugi put. Owner PDF ne prikazuje CF i agency commission u vlasnikovom izvještaju isključuje CF.
- Reservation/Calendar je planirani modul. Rezervacija postoji u kalendaru odmah, ali automatsko kreiranje Income smije početi tek **dan poslije check-ina**, idempotentno, zbog no-show rizika. Ne tretiraj plan kao već implementiran.
- Ne mijenjaj verziju, service worker cache ili release metadata za dokumentacijske promjene. Za stvarni release provjeri kompletan PWA update tok.

## Provjera i predaja

- Pokreni `npm test` poslije promjena koda. Za promjenu poslovnog pravila dodaj smislen regresijski test; provjeri praznu i postojeću bazu kada diraš persistence/UI.
- Ako diraš shemu ili restore, provjeri migraciju i kompatibilnost starih backupa. Za PWA/UI prijavi šta je ručno provjereno.
- Objasni izmjene, testove, preostale rizike i postojeći `git status`. Po potrebi ažuriraj `PROJECT_CONTEXT.md`.
- Ne radi commit, push, merge ili deploy samo zato što je izmjena završena; korisnik će zasebno odlučiti kada želi objaviti promjene.
