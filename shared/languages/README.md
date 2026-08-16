# Built-in Language Packs

Bundled languages use the same folder contract as external language packs.

## Structure
- `shared/languages/<locale>/manifest.json`
- `shared/languages/<locale>/index.json`
- or `shared/languages/<locale>/*.json`

## Required Manifest Fields
- `locale`
- `nativeName`

## Optional Manifest Fields
- `englishName`
- `direction`
- `selectorLanguage`
- `description`

## Runtime Rules
- Turkish (`tr`) is the final fallback language.
- External packs are loaded from `data/shared/languages/<locale>/`.
- Bundled and external packs are merged through the same registry path.
- Invalid external packs are skipped or fall back safely without breaking startup.
