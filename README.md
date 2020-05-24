Texture plugin for OJS3
=======================
### About
This plugin integrates the Texture editor with OJS workflow for direct editing of JATS XML documents.
### Supported  Body Tags
Tag| Description| Link| | 
| --- | --- | --- | --- 
[`address`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/address.html)| :ok:
[`array`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/array.html)| :ok:
[`boxed-text`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/boxed-text.html)| :ok:
[`chem-struct-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/chem-struct-wrap.html)| :ok:
[`code`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/code.html)| :ok:
[`fig`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig.html)| :ok:
[`fig-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig-group.html)| :ok:
[`graphic`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/graphic.html)| :ok:
[`media`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/media.html)| :ok:
[`preformat`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/preformat.html)| :ok:
[`supplementary-material`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/supplementary-material.html)| :ok:
[`table-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap.html)| :ok:
[`table-wrap-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap-group.html)| :ok:
[`alternatives`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/alternatives.html)| :ok:
[`disp-formula`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula.html)| :ok:
[`disp-formula-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula-group.html)| :ok:
[`def-list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/def-list.html)| :ok:
[`list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/list.html)| :ok:
[`tex-math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/tex-math.html)| :ok:
[`mml:math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/mml:math.html)| :ok:
[`p`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/p.html)| :ok:
[`related-article`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-article.html)| :ok:
[`related-object`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-object.html)| :ok:
[`ack`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/ack.html)| :ok:
[`disp-quote`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-quote.html)| :ok:
[`speech`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/speech.html)| :ok:
[`statement`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/statement.html)| :ok:
[`verse-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/verse-group.html)| :ok:
[`x`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/x.html)| :ok:
[`sec`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sec.html)| :ok:
[`sig-block`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sig-block.html)| :ok:
### Installation
Texture is available under Plugin gallery
 
* Settings -> Web site -> Plugins -> Plugin gallery 
![texture_plugin](docs/plugin_gallery.png)
### Usage
Texture supports editing XML files in [JATS](https://jats.nlm.nih.gov/archiving/1.1/) XML standard.
* After plugin installation,  go to a `Production Stage` of the submission
* Upload JATS XML to the  `Production Ready` state. You can find sample files [blank manuscript](https://github.com/substance/texture/tree/master/data/blank) or a [list of samples](https://github.com/substance/texture/tree/master/data/) here.
![production_ready_edit](docs/production_ready_edit.png)
* All the uploaded images in texture are integrated as dependent files in production ready stage.
* When you later publish the texture-edited JATS XML file as galley, you have to upload the images **again** in the dependancy grid.
![gallery_edit](docs/galley_edit.png)
* In the editing modal, upload the same images as dependent files you uploaded for texture.  
### Issues
Please find any issues here 
* https://github.com/pkp/texture/issues
