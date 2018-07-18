{**
 * plugins/generic/markup/templates/editor.tpl
 *
 * Copyright (c) 2014-2018 Simon Fraser University
 * Copyright (c) 2003-2018 John Willinsky
 * Distributed under the GNU GPL v2. For full terms see the file docs/COPYING.
 *
 * Texture editor page
 *}
<!DOCTYPE html>
<html>
	<head>
		<meta charset="UTF-8">
		<meta name="jobId" content="{$documentUrl|escape}">

		{* Texture dependencies (see index.html in Texture distribution) *}
		<link href="{$textureUrl|escape}/texture.css" rel="stylesheet" type="text/css"/>
		<link href="{$textureUrl|escape}/texture-reset.css" rel="stylesheet" type="text/css"/>
		<link href="{$textureUrl|escape}/substance/dist/substance.css" rel="stylesheet" type="text/css"/>
		<link href="{$textureUrl|escape}/texture-pagestyle.css" rel="stylesheet" type="text/css"/>
		<link href="{$textureUrl|escape}/katex/katex.min.css" rel="stylesheet" type="text/css"/>
		<link href="{$textureUrl|escape}/font-awesome/css/font-awesome.min.css" rel="stylesheet" type="text/css"/>

		{* Texture plugin additions *}
		<link href="{$texturePluginUrl|escape}/editor.css" rel="stylesheet" type="text/css"/>
	</head>
	<body>
		<div id="toolbar">
			<div id="feedback" class="save-feedback"></div>
			<input class="save-btn" type="button" id="saveDocument" value="{translate key="common.save"}" />
		</div>

		<div id="editor"></div>
	
		{* Texture dependencies (see index.html in Texture distribution) *}
		<script type="text/javascript" src="{$textureUrl|escape}/substance/dist/substance.js"></script>
		<script type="text/javascript" src="{$textureUrl|escape}/katex/katex.min.js"></script>
		<script type="text/javascript" src="{$textureUrl|escape}/texture.js"></script>
		<script type="text/javascript" src="{$textureUrl|escape}/vfs.js"></script>

		<script type="text/javascript" src="{$baseUrl|escape}/lib/pkp/lib/components/jquery/jquery.min.js"></script>

		{* Texture plugin additions *}
		<script type="text/javascript" src="{$texturePluginUrl|escape}/editor.js"></script>
		<script type="text/javascript" src="{$texturePluginUrl|escape}/app.js"></script>
	</body>
</html>
