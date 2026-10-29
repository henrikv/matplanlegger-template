# Matplanlegger

En liten, privat nettside for familiens ukemeny. Den viser middagene med ingredienser og steg-for-steg-matlaging, lar hver i familien stemme på retter, foreslå endringer, merke favoritter, legge inn handleønsker og registrere hva som er igjen i skapet.

Selve planleggingen gjør du sammen med Claude (eller en annen AI-assistent). Den skriver ukens meny til `content/menus.json` etter reglene i [docs/START-HER.md](docs/START-HER.md). Siden er bare visningen og det delte arkivet.

- **Kjører på:** Cloudflare Workers + D1 (SQLite), gratisnivået holder for en familie.
- **Innlogging:** Cloudflare Access. Familien logger inn med en engangskode på e-post. Worker-en verifiserer Access-tokenet på hver forespørsel og avviser alt annet.
- **Ingen avhengigheter:** Ren JavaScript. Node 22.13 eller nyere kreves bare for tester og lokal forhåndsvisning.

## Kom i gang lokalt

```bash
npm test          # tester med SQLite i minnet
npm run dev       # bygger og starter http://127.0.0.1:5173 med en lokal testbruker
```

Lokal forhåndsvisning bruker en falsk innlogget bruker og en database i minnet som nullstilles ved omstart.

## Sett opp din egen

Du trenger en gratis Cloudflare-konto og et eget GitHub-repo (fork eller kopi av dette).

### 1. Database

```bash
npx wrangler@4 login
npx wrangler@4 d1 create matplanlegger
```

Kopier `database_id` fra svaret inn i `wrangler.jsonc`. Tabellene opprettes automatisk første gang siden brukes.

### 2. Første deploy

```bash
npm run deploy
```

Siden havner på `https://matplanlegger.<ditt-subdomene>.workers.dev` og svarer **403 Ikke tilgang** til alle. Det er riktig: Worker-en slipper ingen inn før Access er satt opp.

### 3. Innlogging med Cloudflare Access

1. I Cloudflare-dashboardet: **Workers & Pages** → **matplanlegger** → fanen **Access**.
2. Første gang ber den deg om å **Set up Zero Trust**: velg et teamnavn (blir `teamnavn.cloudflareaccess.com`) og **Free**-planen (opptil 50 brukere). Cloudflare ber om betalingskort også på gratisplanen, men trekker ingenting.
3. Tilbake i Access-fanen: **Protect this Worker behind Access** → **All traffic** → velg **Cloudflare account members** foreløpig → **Apply Access**.
4. Legg til familien: **Zero Trust** → **Access** → **Policies** → **Add a policy**. Gi den et eget navn (for eksempel «matplanlegger – familie»), velg **Allow** og legg inn **Emails** for hver i familien. Koble policyen til matplanlegger-appen under **Access** → **Applications**.
   - Bruk en egen policy. Standardpolicyen som opprettes kan være delt med andre Workers på kontoen.
   - Ikke bruk «Email domain» med `gmail.com`, det slipper inn alle med Gmail.
5. Slå på engangskode: **Zero Trust** → **Integrations** → **Identity providers** → **Add new identity provider** → **One-time PIN**. Nye Zero Trust-kontoer har bare innlogging med Cloudflare-konto, så uten dette kommer ikke resten av familien inn.

### 4. Koble Worker-en til Access

Åpne siden i en privat fane. Du blir sendt til innloggingssiden `https://<teamnavn>.cloudflareaccess.com/cdn-cgi/access/login/...`. Du trenger to verdier:

- **ACCESS_TEAM_DOMAIN:** `<teamnavn>.cloudflareaccess.com`, uten `https://`
- **ACCESS_AUD:** står under **Access** → **Applications** → matplanlegger → **Overview** (Application Audience Tag)

Legg dem inn i `wrangler.jsonc` sammen med visningsnavn:

```jsonc
"vars": {
  "ACCESS_TEAM_DOMAIN": "teamnavn.cloudflareaccess.com",
  "ACCESS_AUD": "0123abcd...",
  "DISPLAY_NAMES": "{\"kari@example.com\":\"Kari\",\"ola@example.com\":\"Ola\"}"
}
```

Deploy på nytt. Ingen av verdiene er hemmelige, så de kan ligge i Git.

### 5. Automatisk deploy fra GitHub (valgfritt, anbefalt)

**Workers & Pages** → **matplanlegger** → **Settings** → **Builds** → **GitHub**. Gi Cloudflare tilgang bare til dette repoet.

| Innstilling | Verdi |
|---|---|
| Branch | `main` |
| Build command | `npm test && npm run build` |
| Deploy command | `npx wrangler deploy` |
| Miljøvariabel (build) | `NODE_VERSION` = `22` |

Hver push til `main` testes, bygges og deployes. Det gjør det mulig å oppdatere menyen fra en Claude-økt hvor som helst.

## Ny meny

Legg nye uker **først** i `content/menus.json`. Behold gamle uker og deres `id`-er, ellers mister stemmer og favoritter koblingen til rettene. Hver rett har:

- `id`, `day`, `label`, `title`, `note`
- `ingredientGroups`: ingredienser gruppert per komponent (`title` + `items`). Ta med en egen sausgruppe.
- `ingredients`: samme ingredienser som flat liste
- `steps`: nummererte, konkrete steg med mengder, varme og rekkefølge
- `pantry`, `leftovers` (valgfritt) og `servingsLabel` (valgfritt, overstyrer ukens)

Se eksempeluken i `content/menus.json`.

## Sikkerhet

- Worker-en krever et gyldig Access-token (signatur, audience, utsteder, utløp) på **alle** forespørsler, også selve siden. Mangler oppsettet, svarer den 403.
- `AUTH_MODE=sites` gjør at Worker-en stoler på identitetsheadere fra plattformen i stedet. Det brukes bare av testene og lokal forhåndsvisning. Ikke sett det på Cloudflare.
- Familiedata (stemmer, lager, ønsker) ligger i D1, ikke i Git. Hold personopplysninger og handlehistorikk utenfor repoet hvis det er offentlig.

## Struktur

| Sti | Innhold |
|---|---|
| `worker/server.js` | API, innlogging og D1-lagring |
| `worker/client.js`, `index.html`, `style.css` | Nettsiden |
| `content/menus.json` | Menyene, nyeste først |
| `scripts/` | Bygg, validering og lokal forhåndsvisning |
| `tests/` | Tester med SQLite i minnet |
| `docs/START-HER.md` | Planleggingsreglene for AI-assistenten |
| `CLAUDE.md` | Instruks til Claude Code |
