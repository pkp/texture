
Table of Contents
=================

   * [Introduction](#introduction)
   * [Handbook](#handbook)
   * [Installation](#installation)
   * [Suppoted JATS  Tags](#suppoted-jats--tags)
   * [Usage](#usage)
   * [Issues](#issues)

# Introduction



OJS Texture Plugin integrates the Texture editor with OJS workflow for direct editing of JATS XML documents.



# Handbook



* [Download](Texture_Handbook.pdf) (Beta version)





# Installation

Texture is available under Plugin gallery

 

* Settings -> Web site -> Plugins -> Plugin gallery 

![texture_plugin](docs/plugin_gallery.png)




# Suppoted JATS  Tags
Tag| Definition| Support
| --- | --- | --- 
| <img width=800/>| <img width=800/>| <img width=800/>
[code](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/code.html)| A container element for technical contentsuch as programming language code, pseudo-code, schemas, or a markup fragment.| :ok:
[disp-formula](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula.html)| Mathematical equation, expression, or formula that is to be displayed as a block            (callout) within the narrative flow.| :ok:
[disp-quote](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-quote.html)| Extract or extended quoted passage from another work, usually made typographically            distinct from surrounding text.| :ok:
[fig-group](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig-group.html)| Container element for figures that are to be displayed together.| :ok:
[fig](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig.html)| Block of graphic or textual material that is identified as a figure, usually bearing a caption and a label such as “Figure 3.” or “Figure”.| :ok:
[graphic](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/graphic.html)| Description of and pointer to an external file containing a still image.| :ok:
[list](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/list.html)| Sequence of two or more items, which may or may not be ordered.| :ok:
[p](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/p.html)| Textual unit or block; a textual paragraph.| :ok:
[preformat](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/preformat.html)| Text in which spaces, tabs, and line feeds must be preserved. Content is typically displayed in monofont to preserve character alignment.| :ok:
[sec](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sec.html)| Headed group of material; the basic structural unit of the body of a document.| :ok:
[supplementary-material](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/supplementary-material.html)| Container element for a description of, and possibly a pointer to,external resources that support the article, but which are not part of the content of the article.| :ok:
[table-wrap](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap.html)| Wrapper element for a complete table, including the tabular material (rows and columns), caption (including title), footnotes, and alternative descriptions of the table for purposes of accessibility.| :ok:
[tex-math](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/tex-math.html)| Used to hold encoded math, expressed in TeX or LaTeX.| :ok:
[ack](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/ack.html)| Textual material that names the parties who the author wishes to thank or recognize for their assistance in/contributions toward the article, for example, producing the work, funding the work, inspiring the work, or assisting in the research on which the work is based.| --
[address](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/address.html)| Container element for contact information such as a postal address for a person or organization.| --
[alternatives](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/alternatives.html)| Container element used to hold a group of processing alternatives, for example, a single<graphic> that ships in several formats(tif, gif, and jpeg) or in different resolutions. This element is a physical grouping to contain multiple logically equivalent (substitutable) versions of the same information object. Typically these are processing alternatives, and the reader is expected to see only one version of the object.| --
[array](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/array.html)| Tabular arrangement of text in the narrative flow of the document. Unlike a  <table-wrap>, an array does not contain a label, title, caption, or table headings (column heads).| --
[boxed-text](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/boxed-text.html)| Textual material that is part of the body but is outside the flow of the narrativetext (for example, a sidebar).| --
[chem-struct-wrap](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/chem-struct-wrap.html)| Wrapper element for a chemical expression, reaction, equation, etc. that is set apart from the text; includes any number, label, or caption that accompanies the chemical expression.| --
[def-list](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/def-list.html)| List in which each item consists of two parts: 1) a word, phrase, term, graphic,chemical structure, or equation, that is paired with 2) one or more descriptions, discussions, explanations, or definitions of it.| --
[disp-formula-group](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula-group.html)| Container element for equations or other mathematical expressions.| --
[media](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/media.html)| Description of and pointer to an external file that holds a media object (for example, an animation, a movie).| --
[related-article](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-article.html)| Description of a journal article related to the content but published separately. May include a link to the related article.| --
[related-object](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-object.html)| Description of an object (for example, book, book chapter, figure, or  table) related to the article content but published separately. May include a link to the related object.| --
[sig-block](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sig-block.html)| Area of text and graphic material placed at the end of the body of a document or document component to hold the graphic signature or description of the person(s) responsible for or attesting to the content.| --
[speech](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/speech.html)| One exchange (a single speech) in a real or imaginary conversation between two or more entities.| --
[statement](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/statement.html)| Theorem, Lemma, Proof, Postulate, Hypothesis, Proposition, Corollary, or other formal statement, identified as such with a label and usually made typographically distinct from the surrounding text.| --
[table-wrap-group](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap-group.html)| Container element for tables (<table-wrap> elements) that are to be displayed together.| --
[verse-group](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/verse-group.html)| Song, poem, or verse.| --
[x](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/x.html)| Generated text or punctuation. Typically used when:an archive decides not to have text generated on display and thus to        pre-generate such things as commas or semicolons between keywords, oran archive receives text with <x>        tags embedded and wishes to retain them. | --


# Usage



Texture supports editing XML files in [JATS](https://jats.nlm.nih.gov/archiving/1.1/) XML standard.



* After plugin installation,  go to a `Production Stage` of the submission

* Upload JATS XML to the  `Production Ready` state. You can find sample files [blank manuscript](https://github.com/substance/texture/tree/master/data/blank) or a [list of samples](https://github.com/substance/texture/tree/master/data/) here.

![production_ready_edit](docs/production_ready_edit.png)

* All the uploaded images in texture are integrated as dependent files in production ready stage.

* When you later publish the texture-edited JATS XML file as galley, you have to upload the images **again** in the dependancy grid.

![gallery_edit](docs/galley_edit.png)

* In the editing modal, upload the same images as dependent files you uploaded for texture.  

# Issues

Please find any issues here 

* https://github.com/pkp/texture/issues
