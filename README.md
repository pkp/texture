Texture plugin for OJS3
=======================
### About
This plugin integrates the Texture editor with OJS workflow for direct editing of JATS XML documents.
### Supported  Body Tags
Tag| definition| Example| | 
| --- | --- | --- | --- 
[`address`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/address.html)| | 
[`array`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/array.html)| | 
[`boxed-text`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/boxed-text.html)| | 
[`chem-struct-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/chem-struct-wrap.html)| | 
[`code`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/code.html)| :heavy_check_mark:| 
[`fig`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig.html)| :heavy_check_mark:| 
[`fig-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig-group.html)| :heavy_check_mark:| 
[`graphic`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/graphic.html)| :heavy_check_mark:| 
[`media`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/media.html)| | 
[`preformat`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/preformat.html)| :heavy_check_mark:| 
[`supplementary-material`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/supplementary-material.html)| :heavy_check_mark:| 
[`table-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap.html)| :heavy_check_mark:| 
[`table-wrap-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap-group.html)| | 
[`alternatives`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/alternatives.html)| | 
[`disp-formula`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula.html)| :heavy_check_mark:| 
[`disp-formula-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula-group.html)| | 
[`def-list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/def-list.html)| | 
[`list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/list.html)| :heavy_check_mark:| 
[`tex-math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/tex-math.html)| :heavy_check_mark:| 
[`mml:math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/mml:math.html)| | 
[`p`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/p.html)| :heavy_check_mark:| 
[`related-article`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-article.html)| | 
[`related-object`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-object.html)| | 
[`ack`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/ack.html)| | 
[`disp-quote`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-quote.html)| :heavy_check_mark:| 
[`speech`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/speech.html)| | 
[`statement`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/statement.html)| | 
[`verse-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/verse-group.html)| | 
[`x`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/x.html)| | 
[`sec`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sec.html)| :heavy_check_mark:| 
[`sig-block`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sig-block.html)| | 
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
