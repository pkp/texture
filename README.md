Texture plugin for OJS3
=======================
### About
This plugin integrates the Texture editor with OJS workflow for direct editing of JATS XML documents.
### Supported  Body Tags
Tag| definition| Example| | 
| --- | --- | --- | --- 
[`address`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/address.html)| | ```xml
...<article-meta>...<contrib-group><contrib contrib-type="author"><name><surname>Silverstein</surname><given-names>Michael Q.</given-names></name><aff id="UWW"><institution>Department of PathobiologyUniversity of WallieWash</institution><addr-line>Oberlin, Washington 96204</addr-line><country>USA</country></aff></contrib><contrib contrib-type="author"><name><surname>Taylor</surname><given-names>James C.</given-names></name><degrees>Ph D</degrees><aff id="affKalakukko">Kalakukko Corporation</aff><address><institution>Kalakukko Corporation</institution><addr-line>17 West Jefferson St.</addr-line><addr-line>Suite 207</addr-line><addr-line>New South Finland, MD 20856.</addr-line><country>USA</country><phone>(301) 754-5766</phone><fax>(301) 754-5765</fax><email>jct@kalakukko.com</email><uri>http://www.kalakukko.com</uri></address></contrib></contrib-group>...</article-meta>...
```
[`array`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/array.html)| | ```xml
... <array><tbody><tr valign="bottom"><td align="left">3</td><td align="char" char="." charoff="35%">14.4411</td><td align="center"><graphic id="g14" orientation="portrait" position="anchor" xlink:href="d14"/></td><td align="char" char="." charoff="35%">14.4411</td><td align="center"><graphic id="g15" orientation="portrait" position="anchor" xlink:href="d15"/></td><td align="char" char="." charoff="35%">14.4414</td><td align="center"><graphic id="g16" orientation="portrait" position="anchor" xlink:href="d16"/></td><td align="char" char="." charoff="35%">14.4414</td><td align="center"><graphic id="g17" orientation="portrait" position="anchor" xlink:href="d17"/></td></tr></tbody></array>  ...
```
[`boxed-text`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/boxed-text.html)| | ```xml
...<sec><title>Conclusions</title><p>Day hospital care ... are justifiable.</p><boxed-text position="float"><sec><title>Key messages</title><p><list list-type="bullet"><list-item><p>The benefits of geriatric day hospital care have beencontroversial for many years.</p></list-item><list-item><p>This systematic review of 12 randomised trials comparinga variety of day hospitals with a range of alternativeservices found no overall advantage for day hospital care.</p></list-item><list-item><p>Day hospitals had a possible advantage over no comprehensivecare in terms of death or poor outcome, disability, and use ofresources.</p></list-item><list-item><p>The costs of day hospital care may be partly offset bya reduced use of hospital beds and institutional care amongsurvivors.</p></list-item></list></p></sec></boxed-text><p>...</p><p>...</p></sec>...
```
[`chem-struct-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/chem-struct-wrap.html)| | ```xml
...<chem-struct-wrap><caption><p>Chemical equation for the oxidation of glucose intocardon dioxide and water. Unlike combustion, metabolicpathways involving glycolysis and respiration controlthe release of energy during oxidation, thereby permittingits storage in ATP molecules.  This slow release of energyvia chain reactions with multiple steps can be groupedinto four stages.</p></caption><alternatives><graphic xmlns:xlink="http://www.w3.org/1999/xlink"xlink:href="pq0209587032" specific-use="internet"></graphic><chem-struct>C<sub>6</sub>H<sub>12</sub>O<sub>6</sub> &plus;6 O<sub>2</sub> &xrarr; 6 CO<sub>2</sub> &plus; 6 H<sub>2</sub>O</chem-struct></alternatives></chem-struct-wrap>...
```
[`code`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/code.html)| :heavy_check_mark:| ```xml
...<p>So, to make a simple button:<code     code-type="user interface control"   language="C++"  language-version="11"  xml:space="preserve"   orientation="portrait"  position="anchor">#include &lt;conio.h>#include&lt;win_mous.cpp>// Needed for mouse &amp; win functions#defineOK (x>=170 &amp;&amp; x&lt;=210 &amp;&amp; y>=290 &amp;&amp; y&lt;=310)#defineCANCEL (x>=280 &amp;&amp; x&lt;=330 &amp;&amp; y>=290 &amp;&amp; y&lt;=310)#define PUSHME (x>=170 &amp;&amp; x&lt;=330 &amp;&amp; y>=150 &amp;&amp; y&lt;=250)</code></p>...
```
[`fig`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig.html)| :heavy_check_mark:| ```xml
... <fig id="f1" orientation="portrait" position="float"><graphic xlink:href="f1"/><attrib>Brookhaven National Laboratory</attrib></fig>...
```
[`fig-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/fig-group.html)| :heavy_check_mark:| ```xml
...<fig-group id="dogpix4">  <caption><title>Figures 12-14 Bonnie Lassie</title>  <p>Three perspectives on My Dog</p></caption>  <fig id="fg-12">   <label>a.</label>   <caption><p>View A: From the Front, Laughing</p></caption>   <graphic xlink:href="frontView.png"/>  </fig>  <fig id="fg-13">   <label>b.</label>   <caption><p>View B: From the Side, Best Profile</p></caption>   <graphic xlink:href="sideView.png"/>  </fig>  <fig id="fg-14">   <label>c.</label>   <caption><p>View C: In Motion, A Blur on Feet</p></caption>   <graphic xlink:href="motionView.png"/>  </fig></fig-group>...
```
[`graphic`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/graphic.html)| :heavy_check_mark:| ```xml
... <fig id="f1" orientation="portrait" position="float"><graphic xlink:href="f1"/><attrib>Brookhaven National Laboratory</attrib></fig>...
```
[`media`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/media.html)| | ```xml
...<media id="v1" mime-subtype="avi" mimetype="video" orientation="portrait" position="anchor" specific-use="original-format" xlink:href="v1"><object-id pub-id-type="doi" specific-use="metadata">10.1063/1.4807071.1</object-id></media>...
```
[`preformat`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/preformat.html)| :heavy_check_mark:| ```xml
...<preformat preformat-type="dialog">C:\users\lap make  'make' is not recognized as:    - an internal or external command    - an operable program    - a batch file</preformat>...
```
[`supplementary-material`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/supplementary-material.html)| :heavy_check_mark:| ```xml
...<article-meta>...<contrib-group><contrib contrib-type="author"><collab collab-type="committee">Accredited Standards Committee S3, Bioacoustics</collab></contrib></contrib-group><fpage seq="1">1</fpage><lpage>44</lpage><supplementary-material mime-subtype="zip" mimetype="application"xlink:href="ASASTD.ANSI.ASA.S3.50.supplementary-material.zip"/>...</article-meta>...
```
[`table-wrap`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap.html)| :heavy_check_mark:| ```xml
...<table-wrap id="t2" orientation="portrait" position="float"><label>Table II.</label><caption><p>Models to approximate the bound frequencies as waves in X→M (<inline-graphic id="g1" xlink:href="d1"/>: Rotational, <inline-graphic id="g2" xlink:href="d2"/>: Vibrate in <italic>y</italic> direction, <inline-graphic id="g3" xlink:href="d3"/>: Vibrate in<italic>x</italic> direction, <inline-graphic id="g4" xlink:href="d4"/>: Vibrate mainly in <italic>y</italic> direction including a small portion of vibration in <italic>x</italic> direction, <inline-graphic id="g5" xlink:href="d5"/>: Vibrate mainly in <italic>x</italic> direction including a small portion of vibration in <italic>y</italic> direction).</p></caption><table border="1">...</table></table-wrap>...
```
[`table-wrap-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/table-wrap-group.html)| | ```xml
...<sec><title>Component of Care Provision</title>...<table-wrap-group><table-wrap id="TN0.124"><caption>...</caption><table frame="box" rules="all" cellpadding="5"><thead>...</thead><tbody>...</tbody></table></table-wrap><table-wrap id="TN0.125"><caption>...</caption><table frame="box" rules="all" cellpadding="5"><thead>...</thead><tbody>...</tbody></table></table-wrap><table-wrap id="TN0.126"><caption>...</caption><table frame="box" rules="all" cellpadding="5"><thead>...</thead><tbody>...</tbody></table></table-wrap></table-wrap-group></sec>...
```
[`alternatives`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/alternatives.html)| | ```xml
... <fig id="f3" position="float"><label>FIG. 3.</label><caption>...</caption><alternatives><graphic specific-use="print" xlink:href="1.4821168.figures.highres.f3.zip"/><graphic specific-use="online" xlink:href="1.4821168.figures.online.f3.jpg"/></alternatives></fig>...
```
[`disp-formula`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula.html)| :heavy_check_mark:| ```xml
...<p>... Selected as described for Acc-29<disp-formula><tex-math id="M1"><![CDATA[\documentclass[12pt]{minimal}\usepackage{wasysym}\usepackage[substack]{amsmath}\usepackage{amsfonts}\usepackage{amssymb}\usepackage{amsbsy}\usepackage[mathscr]{eucal}\usepackage{mathrsfs}\DeclareFontFamily{T1}{linotext}{}\DeclareFontShape{T1}{linotext}{m}{n} { &#x003C;-&#x003E; linotext }{}\DeclareSymbolFont{linotext}{T1}{linotext}{m}{n}\DeclareSymbolFontAlphabet{\mathLINOTEXT}{linotext}\begin{document}$${\mathrm{Acc/Acc:\hspace{.5em}}}\frac{{\mathit{ade2-202}}}{{\mathit{ADE2}}}\hspace{.5em}\frac{{\mathit{ura3-59}}}{{\mathit{ura3-59}}}\hspace{.5em}\frac{{\mathit{ADE1}}}{{\mathit{adel-201}}}\hspace{.5em}\frac{{\mathit{ter1-Acc}}}{{\mathit{ter1-Acc}}}\hspace{.5em}\frac{{\mathit{MATa}}}{{\mathit{MAT{\alpha}}}}$$\end{document}]]></tex-math></disp-formula> TER1/ter1-Acc: Acc-29 crossed with ...</p>...
```
[`disp-formula-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-formula-group.html)| | ```xml
...<sec><title>The Quadratic Formula</title><p>...</p><disp-formula-group><disp-formula id="formula-qf-1"><label>(1)</label><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mrow>...</mml:mrow></mml:math></disp-formula><disp-formula id="formula-qf-2"><label>(2)</label><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mrow>...</mml:mrow></mml:math></disp-formula><disp-formula id="formula-qf-3"><label>(3)</label><mml:math xmlns:mml="http://www.w3.org/1998/Math/MathML"><mml:mrow>...</mml:mrow></mml:math></disp-formula></disp-formula-group></sec>...
```
[`def-list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/def-list.html)| | ```xml
<article dtd-version="1.2">...<back>...<glossary><def-list><title>ABBREVIATIONS</title><term-head>Abbreviation</term-head><def-head>Expansion</def-head><def-item><term id="G1">PAP I</term><def><p>poly(A)polymerase I</p></def></def-item><def-item><term id="G2">PNPase</term><def><p>polynucleotide phosphorylase</p></def></def-item></def-list></glossary>...</back></article>
```
[`list`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/list.html)| :heavy_check_mark:| ```xml
...<sec><title>Conclusions</title><p>Day hospital care ... are justifiable.</p><boxed-text position="float"><sec><title>Key messages</title><p><list list-type="bullet"><list-item><p>The benefits of geriatric day hospital care have beencontroversial for many years.</p></list-item><list-item><p>This systematic review of 12 randomised trials comparinga variety of day hospitals with a range of alternativeservices found no overall advantage for day hospital care.</p></list-item><list-item><p>Day hospitals had a possible advantage over no comprehensivecare in terms of death or poor outcome, disability, and use ofresources.</p></list-item><list-item><p>The costs of day hospital care may be partly offset bya reduced use of hospital beds and institutional care amongsurvivors.</p></list-item></list></p></sec></boxed-text><p>...</p><p>...</p></sec>...
```
[`tex-math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/tex-math.html)| :heavy_check_mark:| ```xml
...<p>... Selected as described for Acc-29<disp-formula><tex-math id="M1"><![CDATA[\documentclass[12pt]{minimal}\usepackage{wasysym}\usepackage[substack]{amsmath}\usepackage{amsfonts}\usepackage{amssymb}\usepackage{amsbsy}\usepackage[mathscr]{eucal}\usepackage{mathrsfs}\DeclareFontFamily{T1}{linotext}{}\DeclareFontShape{T1}{linotext}{m}{n} { &#x003C;-&#x003E; linotext }{}\DeclareSymbolFont{linotext}{T1}{linotext}{m}{n}\DeclareSymbolFontAlphabet{\mathLINOTEXT}{linotext}\begin{document}$${\mathrm{Acc/Acc:\hspace{.5em}}}\frac{{\mathit{ade2-202}}}{{\mathit{ADE2}}}\hspace{.5em}\frac{{\mathit{ura3-59}}}{{\mathit{ura3-59}}}\hspace{.5em}\frac{{\mathit{ADE1}}}{{\mathit{adel-201}}}\hspace{.5em}\frac{{\mathit{ter1-Acc}}}{{\mathit{ter1-Acc}}}\hspace{.5em}\frac{{\mathit{MATa}}}{{\mathit{MAT{\alpha}}}}$$\end{document}]]></tex-math></disp-formula> TER1/ter1-Acc: Acc-29 crossed with ...</p>...
```
[`mml:math`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/mml:math.html)| | 
[`p`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/p.html)| :heavy_check_mark:| ```xml
<article dtd-version="1.2"><front>...</front><body><sec sec-type="intro"><title>Introduction</title><p>Geriatric day hospitals developed rapidly in the United Kingdom in the 1960sas an important component of care provision. The model has since been widelyapplied in several Western countries. Day hospitals provide multidisciplinaryassessment and rehabilitation in an outpatient setting and have a pivotalposition between hospital and home based services. ...</p></sec><sec sec-type="methods"><title>Methods</title><p>The primary question addressed was ...</p><sec><title>Inclusion criteria</title><p>We set out to identify all ...</p></sec><sec><title>Search strategy</title><p>We searched for ...</p></sec>...</sec>...</body>...</article>
```
[`related-article`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-article.html)| | ```xml
<article dtd-version="1.2"><front><journal-meta>...</journal-meta><article-meta><title-group><article-title>ABC of oxygen: Diving and oxygen</article-title></title-group><pub-date publication-format="print" date-type="pub" iso-8601-date="1999-03-27"><day>27</day><month>03</month><year>1999</year></pub-date><volume>318</volume><issue>7187</issue><fpage>857</fpage><permissions><copyright-statement>Copyright &#x00A9; 1999, BritishMedical Journal</copyright-statement></permissions><related-article xmlns:xlink="http://www.w3.org/1999/xlink"related-article-type="corrected-article" xlink:href="9765173"vol="317" page="996"/></article-meta></front>...</article>
```
[`related-object`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/related-object.html)| | ```xml
...<p>The toll of AIDS in Africa far exceeds its proportion of the world population.Only 12% of the world's population inhabit Africa, but thecontinent has over 60% of the AIDS-infected population. Mortalitystatistics are complicated by the relationship between Tuberculosisand HIV.<related-object source-id="http://www.ncbi.nlm.nih.gov/entrez/query.fcgi?cmd=Retrieve&amp;dopt=Expanded&amp;db=nlmcatalog&amp;list_uids=1252893"source-id-type="url"source-type="book"><person-group person-group-type="editor"><name><surname>Jamison</surname><given-names>Dean T.</given-names></name>...</person-group><source>Disease and Mortality in Sub-Saharan Africa</source><edition>2</edition><sup>nd</sup><publisher-name>The World Bank</publisher-name><publisher-loc>Washington, DC</publisher-loc><year iso-8601-date="2006">2006</year><isbn>0-8213-6397-2</isbn><size units="pages">416</size></related-object></p>...
```
[`ack`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/ack.html)| | ```xml
...<back><ack><p>We thank B. Beltchev for purification of Hfq, S. Cusack and A. J.Carpousis for the gift of PAP I, A. Ishihama for Hfq antibodies used in Hfqpurification, M. E. Winkler for strains TX2808 and TX2758, I. Boni for remindingus that Hfq binds poly(A), M. Springer for suggesting that Hfq mightrelate PAPs to primitive telomerase, Ph. Derreumeaux for help in sequencecomparisons, M. Grunberg-Manago, C. Condon and R. Buckingham for reading themanuscript, and H. Weber for advice. We also acknowledge Minist&#x00E8;re del'Education Nationale de la Recherche et de la Technologie, Centre National dela Recherche Scientifique, and Paris7 University for support.</p></ack><glossary>...</glossary><ref-list>...</ref-list></back>...
```
[`disp-quote`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/disp-quote.html)| :heavy_check_mark:| ```xml
...<sec><title>Introduction</title><disp-quote><p>Dead flies cause the ointment of the apothecary to send forth astinking savor; so doth a little folly him that is in reputationfor wisdom and honour.</p><attrib>Ecclesiastes 10:1</attrib></disp-quote><p>The term &ldquo;flies in the ointment&rdquo; is occasionally usedto describe minor defects in some endeavor.  But this quote fromEcclesiastes has a much wider scope ...</p></sec>...
```
[`speech`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/speech.html)| | ```xml
...<body>...<p>The participants understood the purpose of their peerresponse groups to be finding mistakes or problems in eachother&rsquo;s essays. ... Clara, one of the Chinese-speakers,explains why she no longer believes the initial positive comments:<speech><speaker>S:</speaker><p>I think Aeenoy start this way. I think she always dothis way, like say some good thing first. And then I knowthe bad thing is coming.</p></speech><speech><speaker>I:</speaker><p>So, why doe she do that?</p></speech><speech><speaker>S:</speaker><p>I think it gives somebody self-esteem ...</p></speech></p>...</body>...
```
[`statement`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/statement.html)| | ```xml
<article dtd-version="1.2"><front>...</front><body>...<p>Industrial buyers categorise foreign countriesaccording to their level of technological achievementand subsequently differentiate their perceptions ofthese countries accordingly. ... The followinghypothesis is posited:<statement><label>Hypothesis 1</label><p>Buyer preferences for companies are influenced byfactors extrinsic to the firm attributable to, anddetermined by, country-of-origin effects.</p></statement></p>...</body><back>...</back></article>
```
[`verse-group`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/verse-group.html)| | ```xml
...<sec><title>Buy or Lease?<break/>Two Models for Scholarly Information<break/>at the End (or the Beginning) of an Era</title><verse-group><verse-line>Some say the world will end in fire,</verse-line><verse-line>Some say in ice.</verse-line><verse-line>From what I&rsquo;ve tasted of desire</verse-line><verse-line>I hold with those who favor fire.</verse-line><verse-line>But if it had to perish twice,</verse-line><verse-line>I think I know enough of hate</verse-line><verse-line>To say that for destruction ice</verse-line><verse-line>Is also great</verse-line><verse-line>And would suffice.</verse-line><attrib>&mdash;Robert Frost &ldquo;Fire and Ice&rdquo;</attrib></verse-group><p>Within living memory, our use of print (static) information has beengoverned by copyright law and the practices that have evolved around it.Enter electronic information, where publishers deliver it with licenses andnew rules, a very different framework from copyright....</p></sec>...
```
[`x`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/x.html)| | ```xml
...<ref><label>13</label><x>. </x><element-citation publication-type="journal"publication-format="print"><collab>American College of Dentists, Board ofRegents</collab><article-title>The ethics of quackery and fraudin dentistry: a position paper</article-title><source>J Am Coll Dent</source><year iso-8601-date="2003">2003</year><volume>70</volume><issue>3</issue><fpage>6</fpage><lpage>8</lpage></element-citation></ref>...
```
[`sec`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sec.html)| :heavy_check_mark:| ```xml
<article dtd-version="1.2">...<body><sec sec-type="intro"><title>Introduction</title><p>Geriatric day hospitals developed rapidly in the United Kingdomin the 1960s as an important component of care provision. The modelhas since been widely applied in several Western countries. Dayhospitals provide multidisciplinary assessment and rehabilitationin an outpatient setting and have a pivotal position between hospitaland home based services. ... We therefore undertook a systematicreview of the randomized trials of day hospital care.</p></sec><sec sec-type="methods"><title>Methods</title><p>The primary question addressed was ...</p><sec><title>Inclusion criteria</title><p>We set out to identify all ...</p></sec><sec><title>Search strategy</title><p>We searched for ...</p></sec>...</sec>...</body><back>...</back></article>
```
[`sig-block`](https://jats.nlm.nih.gov/archiving/tag-library/1.3d1/element/sig-block.html)| | ```xml
...<body><sec><title>A Little String Music</title><p>Jack Riemer ... used to tell the story of a famous 1995violin concert by Itzhak Perlman at Lincoln Center inNew York City ...</p><p>That should be an inspiration to all of us fellow&ldquo;artists&rdquo; in environmental science ...</p></sec><sig-block><sig>Jerald L. Schnoor<break/>Editor<graphic xlink:href="sig2662.f1"xmlns:xlink="http://www.w3.org/1999/xlink"></graphic></sig></sig-block></body>...
```
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
