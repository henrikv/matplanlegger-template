# Matplanlegger – instruksjoner til Claude

Les [docs/START-HER.md](docs/START-HER.md) først. Den har familieprofilen, planleggingsreglene og hvordan en ny uke lages. Les deretter [docs/familieprofil.md](docs/familieprofil.md) hvis den finnes.

- Appen ligger i `worker/`, menyene i `content/menus.json`. Nye uker legges først; behold gamle meny- og rett-ID-er.
- Kjør `npm test` og `npm run build` før push. Push til `main` deployer automatisk hvis Workers Builds er koblet til.
- Oppdater dokumentene i `docs/` når familien gir nye preferanser, tilbakemeldinger på retter eller faktisk beholdning. Skill det som er bekreftet fra det som bare er planlagt.
- Spør bare om antall personer som standard ved ny uke. Ikke regn en foreslått middag som spist, eller en handleliste som bestilt.
- Ingen tokens, passord eller andre hemmeligheter i repoet. Er repoet offentlig: heller ingen navn, e-postadresser, barns rutiner eller handlehistorikk. Legg dem i en privat fork.
