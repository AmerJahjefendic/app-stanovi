# AppStanovi → Codex: prvi koraci

Ovaj paket je za **privatni** repozitorij `app-stanovi`. Ne kopirati ga u sellable `PropertyManagement`.

1. U svom lokalnom folderu `C:\Users\User\Desktop\Podaci\Desktop\AppStanoviv1.0` provjeri `git status` i sačuvaj postojeće izmjene. ZIP korišten pri pripremi već ima lokalne izmjene u `index.html` i `settings.html`; ovaj paket ih ne sadrži i ne mijenja.
2. Raspakuj samo `AGENTS.md` i `PROJECT_CONTEXT.md` iz ovog paketa u **korijen** repozitorija. Postojeći `PROJECT_CONTEXT.md` zamijeni ovom dopunjenom verzijom. Ne raspakuj stari ZIP preko živog repozitorija.
3. Otvori taj lokalni folder kao radni prostor u Codexu. Provjeri `git diff -- AGENTS.md PROJECT_CONTEXT.md` i pokreni `npm test`.
4. Dokumentacijske izmjene možeš commitovati i pushati kada pregledaš diff. Ne moraš dodavati stare chatove; dokument i kod su početni kontekst, a pojedine odluke dopunjavaj kako se razvoj nastavlja.

## Prva poruka u Codexu

> Ovo je moj privatni AppStanovi repozitorij. Prvo pročitaj AGENTS.md i PROJECT_CONTEXT.md, provjeri git status, relevantan kod i testove. Nemoj mijenjati postojeće lokalne izmjene u index.html i settings.html. Ukratko mi potvrdi arhitekturu, trenutno stanje i eventualna odstupanja dokumentacije od koda. Zasad nemoj implementirati novu funkcionalnost, commitovati niti pushati.

## Granica dokumentacije

Paket je pripremljen iz ZIP-a dostavljenog 29.09.2026. Nije direktno upisan u tvoj Windows folder. Ako tvoj lokalni repozitorij ima novije commitove ili izmjene od ovog ZIP-a, prvo uporedi dokumentaciju s njima.
