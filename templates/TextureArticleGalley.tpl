{**
 * templates/TextureArticleGalley.tpl
 *
 * Copyright (c) 2014-2019 Simon Fraser University
 * Copyright (c) 2003-2019 John Willinsky
 * Distributed under the GNU GPL v2. For full terms see the file docs/COPYING.
 *
 * Texture editor page
 *}
<script type="text/javascript">

	$(function() {ldelim}
		$('#textureGalleyForm').pkpHandler('$.pkp.controllers.form.AjaxFormHandler');
	{rdelim})

</script>


<form class="pkp_form" id="textureGalleyForm" method="post" action="{url op="createGalley" submissionId=$submissionId stageId=$stageId fileStage=$fileStage submissionFileId=$submissionFileId}">

    {csrf}

	{fbvFormArea id="textureGalleyFormArea"}
	{fbvFormSection title="submission.layout.galleyLabel" required=true}
	{fbvElement type="text" label="submission.layout.galleyLabelInstructions" value=$label id="label" size=$fbvStyles.size.MEDIUM inline=true required=true}
	{/fbvFormSection}
	{fbvFormSection}
	{fbvElement type="select" id="galleyLocale" label="common.language" from=$supportedLocales selected=$galleyLocale|default:$formLocale size=$fbvStyles.size.MEDIUM translate=false inline=true required=true}
	{/fbvFormSection}


    {fbvFormSection title="plugins.generic.texture.createGalley.customModifications"}

		{fbvFormSection list="true"}
			{fbvElement type="checkbox" id="createJournalMeta" checked=false label="plugins.generic.texture.createGalley.journalMeta"}
		{/fbvFormSection}

		{fbvFormSection}
			{fbvElement type="text" label="plugins.generic.texture.createGalley.fpage" name="createFpage" id="createFpage" maxlength="4" inline=true size=$fbvStyles.size.SMALL required=true}
			{fbvElement type="text" label="plugins.generic.texture.createGalley.lpage" name="createPpage" id="createPpage" maxlength="4" inline=true size=$fbvStyles.size.SMALL required=true}
		{/fbvFormSection}

       {fbvFormSection}
	        {fbvElement type="text" label="plugins.generic.texture.createGalley.datePublished" name="createPpage" id="createDatePublished" value=$datePublished maxlength="10" inline=true size=$fbvStyles.size.SMALL required=true}
       {/fbvFormSection}



    {/fbvFormSection}

    {/fbvFormArea}

    {fbvFormButtons submitText="common.save"}
</form>

