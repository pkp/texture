# OJS Texture Plugin

Integrates the [Texture](https://github.com/substance/texture) editor with OJS workflow for direct editing of [JATS XML](https://jats.nlm.nih.gov/archiving/1.1/) documents.

## Installation

```bash
cd $OJS
git clone -b stable-3_5_0 https://github.com/pkp/texture.git plugins/generic/texture
cd plugins/generic/texture
npm install
npm run build
cd $OJS
php lib/pkp/tools/installPluginVersion.php plugins/generic/texture/version.xml
```

Activate in *Settings > Website > Plugins*.

## Usage

1. Go to the `Production Stage` of a submission
2. Upload JATS XML to `Production Ready` ([blank manuscript](https://github.com/substance/texture/tree/master/data/blank) | [samples](https://github.com/substance/texture/tree/master/data/))
3. Uploaded images are integrated as dependent files in production ready stage
4. When publishing as galley, re-upload images in the dependency grid

## Supported JATS Tags

**Supported:** `code`, `disp-formula`, `disp-quote`, `fig`, `fig-group`, `graphic`, `list`, `p`, `preformat`, `sec`, `supplementary-material`, `table-wrap`, `tex-math`

**Not yet supported:** `ack`, `address`, `alternatives`, `array`, `boxed-text`, `chem-struct-wrap`, `def-list`, `disp-formula-group`, `media`, `related-article`, `related-object`, `sig-block`, `speech`, `statement`, `table-wrap-group`, `verse-group`, `x`

## API Endpoints

All endpoints require parameters: `submissionId` (int), `fileId` (int), `stageId` (int).

| Method | Endpoint | Description | Extra Params |
|--------|----------|-------------|--------------|
| GET | `/texture/json` | Get DAR file (JSON) | -- |
| PUT | `/texture/json` | Update DAR file | Payload: DAR file |
| GET | `/texture/media` | Get media file | `fileName` (string) |
| DELETE | `/texture/media` | Delete media file | -- |

## Resources

- [Handbook](docs/Texture_Handbook.pdf) (Beta)
- [Issues](https://github.com/pkp/texture/issues)
