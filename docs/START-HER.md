# Matplanlegger – start her

Dette er utgangspunktet for AI-assistenten som planlegger middagene. Fyll inn familieprofilen, og hold reglene oppdatert etter hvert som dere lærer hva som fungerer. Nyeste beskjed fra familien går alltid foran det som står her.

## Familieprofil (fyll inn)

- **Husholdning:** for eksempel 2 voksne og 2 barn. Barn spiser omtrent en halv voksenporsjon.
- **Levering/handledag:** for eksempel søndag.
- **Faste ønsker:** for eksempel fredagstaco, én fiskemiddag, en litt bedre lørdagsmiddag, to restemiddager.
- **Ikke likt / allergier:**
- **Foretrukne produkter og butikk:**

Flere detaljer (matpakker, frokost, faste varer, pakningsstørrelser) kan ligge i `docs/familieprofil.md`. Er repoet offentlig, hold den filen i en privat fork.

## Ny uke

1. **Eneste standardspørsmål: Hvor mange blir dere den uken?** Ingen lang spørsmålsrunde om hver basisvare. Bruk rimelige, tydelig merkede anslag.
2. Les familiens innspill fra siden først: stemmer, foreslåtte endringer, favoritter, handleønsker og lagerstatus.
3. Lag menyen og legg den **først** i `content/menus.json`. Behold eldre uker og ID-er.
4. Oppdater denne filen med ukens plan og det som er bekreftet.

## Regler for oppskriftene

- **Gode retter først.** Ikke press lagervarer inn i oppskrifter de ikke passer i.
- **Tydelig smak uten å måtte være sterkt.** Mild base til barna, gjerne sterkere tilbehør til de voksne.
- **Hver middag har en egen saus eller dipp**, med egen ingrediensgruppe og eget steg. Marinade eller stekesjy alene holder ikke. Enkle grep: spicy mayo (majones + sriracha), mango chutney, yoghurt- eller hvitløkssaus, tzatziki, rømmedipp, salsa.
- **Mengder i husholdningsenheter**, ikke gram, for grønnsaker, frukt, urter og meieri: 1 / ½ / ¼ paprika, 2 gulrøtter, 1 løk, en neve koriander, en bit ingefær på 3 cm. Bruk dl for ris, yoghurt, rømme og revet ost, og ss for smør og tomatpuré. Gram brukes bare for kjøtt, fisk, pasta og ferdige pakninger.
- **Ingredienser gruppert per komponent**, også i matlagingsmodus. Nummererte, konkrete steg med mengder, varme og rekkefølge.
- Skill dagens mengder fra hele ukens innkjøp, og råvekt fra ferdig vekt. Merk tydelig hva som settes av til rester, og hvordan det oppbevares.
- Regn hele husholdningen når handlelisten lages: middager, matpakker, frokost, kveldsmat og helgemat.

## Plan og faktisk – hold dem adskilt

**Bekreftet av familien:**
- (Hva som ble laget, hva som var godt eller manglet, hva som faktisk er igjen.)

**Planlagt denne uken, ikke bekreftet spist:**

| Dag | Middag |
|---|---|
| Mandag | |
| Tirsdag | |
| Onsdag | |
| Torsdag | |
| Fredag | |
| Lørdag | |
| Søndag | |
