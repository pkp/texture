<?php

/**
 * @file plugins/generic/texture/TextureHandler.inc.php
 *
 * Copyright (c) 2014-2018 Simon Fraser University
 * Copyright (c) 2003-2018 John Willinsky
 * Distributed under the GNU GPL v2. For full terms see the file docs/COPYING.
 *
 * @class TextureHandler
 * @ingroup plugins_generic_texture
 *
 * @brief Handle requests for Texture plugin
 */

import('classes.handler.Handler');

class TextureHandler extends Handler {
	/** @var MarkupPlugin The Texture plugin */
	protected $_plugin;
	
	/**
	 * Constructor
	 */
	function __construct() {
		parent::__construct();
		$this->_plugin = PluginRegistry::getPlugin('generic', TEXTURE_PLUGIN_NAME);
		$this->addRoleAssignment(
			array(ROLE_ID_MANAGER, ROLE_ID_SUB_EDITOR, ROLE_ID_ASSISTANT, ROLE_ID_REVIEWER, ROLE_ID_AUTHOR),
			array('editor', 'json', 'media')
		);
	}	

	/**
	 * @copydoc PKPHandler::authorize()
	 */
	function authorize($request, &$args, $roleAssignments) {
		import('lib.pkp.classes.security.authorization.SubmissionFileAccessPolicy');
		$this->addPolicy(new SubmissionFileAccessPolicy($request, $args, $roleAssignments, SUBMISSION_FILE_ACCESS_READ));
		return parent::authorize($request, $args, $roleAssignments);
	}
	
	/**
	 * Display substance editor
	 * 
	 * @param $args array
	 * @param $request PKPRequest
	 * 
	 * @return string
	 */
	public function editor($args, $request) {
		$stageId = (int) $request->getUserVar('stageId');
		
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		if (!$submissionFile) {
			fatalError('Invalid request');
		}
		
		$fileId = $submissionFile->getFileId();
		$editorTemplateFile = method_exists($this->_plugin, 'getTemplateResource')?$this->_plugin->getTemplateResource('editor.tpl'):($this->_plugin->getTemplateResourceName() . ':templates/editor.tpl');
		$router = $request->getRouter();
		$documentUrl = $router->url($request, null, 'texture', 'json', null, 
			array(
				'submissionId' => $submissionFile->getSubmissionId(), 
				'fileId' => $fileId,
				'stageId' => $stageId,
			)
		);
		
		AppLocale::requireComponents(LOCALE_COMPONENT_APP_COMMON,  LOCALE_COMPONENT_PKP_MANAGER);
		$templateMgr = TemplateManager::getManager($request);
		$templateMgr->assign(array(
			'documentUrl' => $documentUrl,
			'textureUrl' => $this->_plugin->getTextureUrl($request),
			'texturePluginUrl' => $this->_plugin->getPluginUrl($request),
		));
		return $templateMgr->fetch($editorTemplateFile);
	}
	
	/**
	 * fetch json archive 
	 * 
	 * @param $args array
	 * @param $request PKPRequest
	 * 
	 * @return string
	 */
	public function json($args, $request) {
		$user = $request->getUser();
		$context = $request->getContext();
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		if (!$submissionFile) {
			fatalError('Invalid request');
		}
		
		$fileId = $submissionFile->getFileId();
		$stageId = (int) $request->getUserVar('stageId');
		
		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		if (empty($submissionFile)) {
			echo __('plugins.generic.texture.archive.noArticle'); // TODO custom message
			exit;
		}
		
		$filePath = $submissionFile->getFilePath();
		$postData = $this->_parseRawHttpRequest();
		if (!empty($postData)) {
			$archive = json_decode($postData['_archive']);
			$resources = (array) $archive->resources;
			if (isset($resources['manuscript.xml']) && is_object($resources['manuscript.xml'])) {
				$manuscriptXml = $resources['manuscript.xml']->data;
				// save xml to temp file
				$tmpfname = tempnam(sys_get_temp_dir(), 'texture');
				file_put_contents($tmpfname, $manuscriptXml);
				// temp file to submission file
				$submissionDao = Application::getSubmissionDAO();
				$submissionId = $submissionFile->getSubmissionId();
				$submission = $submissionDao->getById($submissionId);
				$genreId = $submissionFile->getGenreId();
				$fileSize = filesize($tmpfname);
				
				$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
				$newSubmissionFile = $submissionFileDao->newDataObjectByGenreId($genreId);
				$newSubmissionFile->setSubmissionId($submission->getId());
				$newSubmissionFile->setSubmissionLocale($submission->getLocale());
				$newSubmissionFile->setGenreId($genreId);
				$newSubmissionFile->setFileStage($submissionFile->getFileStage());
				$newSubmissionFile->setDateUploaded(Core::getCurrentDate());
				$newSubmissionFile->setDateModified(Core::getCurrentDate());
				$newSubmissionFile->setOriginalFileName($submissionFile->getOriginalFileName());
				$newSubmissionFile->setUploaderUserId($user->getId());
				$newSubmissionFile->setFileSize($fileSize);
				$newSubmissionFile->setFileType($submissionFile->getFileType());
				$newSubmissionFile->setSourceFileId($submissionFile->getFileId());
				$newSubmissionFile->setSourceRevision($submissionFile->getRevision());
				$newSubmissionFile->setFileId($submissionFile->getFileId());
				$newSubmissionFile->setRevision($submissionFile->getRevision()+1);
				$insertedSubmissionFile = $submissionFileDao->insertObject($newSubmissionFile, $tmpfname);
				
				
				return new JSONMessage(true, array(
					'submissionId' => $insertedSubmissionFile->getSubmissionId(),
					'fileId' => $insertedSubmissionFile->getFileIdAndRevision(),
					'fileStage' => $insertedSubmissionFile->getFileStage(),
				));
			}
			return new JSONMessage(false);
		} else {
			$assets = array();
			$manuscriptXml = file_get_contents($filePath);
			$manifestXml = $this->_buildManifestXMLFromDocument($manuscriptXml, $assets);
			// media url
			$mediaInfos = $this->_buildMediaInfo($request, $assets);
			$resources = array(
				'manifest.xml'      => array(
					'encoding'      => 'utf8',
					'data'          => $manifestXml,
					'size'          => strlen($manifestXml),
					'createdAt'     => 0,
					'updatedAt'     => 0,
				),
				'manuscript.xml'  => array(
					'encoding'      => 'utf8',
					'data'          => $manuscriptXml,
					'size'          => filesize($document->path),
					'createdAt'     => 0,
					'updatedAt'     => 0,
				),
			);
			$data = array(
				'version'       => 'AE2F112D',
				'resources'     => array_merge($resources, $mediaInfos)
			);
			header('Content-Type: application/json');
			return json_encode($data, JSON_UNESCAPED_SLASHES);
		}
	}

	/**
	 * Helper function to manually parse raw multipart/form-data associated to
	 * texture PUT request on save
	 */
	protected function _parseRawHttpRequest() {
		$formData = array();
		// read incoming data
		$input = file_get_contents('php://input');
		// grab multipart boundary from content type header
		preg_match('/boundary=(.*)$/', $_SERVER['CONTENT_TYPE'], $matches);
		$boundary = $matches[1];
		// split content by boundary and get rid of last -- element
		$a_blocks = preg_split("/-+$boundary/", $input);
		array_pop($a_blocks);
		// loop data blocks
		foreach ($a_blocks as $id => $block)
		{
			if (empty($block))
				continue;
			// you'll have to var_dump $block to understand this and maybe replace \n or \r with a visibile char
			// parse uploaded files
			if (strpos($block, 'application/octet-stream') !== FALSE)
			{
				// match "name", then everything after "stream" (optional) except for prepending newlines
				preg_match("/name=\"([^\"]*)\".*stream[\n|\r]+([^\n\r].*)?$/s", $block, $matches);
			}
			// parse all other fields
			else
			{
				// match "name" and optional value in between newline sequences
				preg_match('/name=\"([^\"]*)\"[\n|\r]+([^\n\r].*)?\r$/s', $block, $matches);
			}
			$formData[$matches[1]] = $matches[2];
		}
		return $formData;
	}

	/**
	 * Build media info
	 * 
	 * @param $request PKPRquest
	 * @param $assets array
	 * @return array
	 */
	protected function _buildMediaInfo($request, $assets) {
		$infos = array();
		$mediaDir = 'texture/media';
		$context = $request->getContext();
		$router = $request->getRouter();
		$dispatcher = $router->getDispatcher();
		$fileId = $request->getUserVar('fileId');
		$stageId = $request->getUserVar('stageId');
		$submissionId = $request->getUserVar('submissionId');
		// build mapping to assets file paths
		$assetsFilePaths = array();
		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		import('lib.pkp.classes.submission.SubmissionFile'); // Constants
		$dependentFiles = $submissionFileDao->getLatestRevisionsByAssocId(
			ASSOC_TYPE_SUBMISSION_FILE,
			$fileId,
			$submissionId,
			SUBMISSION_FILE_DEPENDENT
		);
		foreach ($dependentFiles as $dFile) {
			$assetsFilePaths[$dFile->getOriginalFileName()] = $dFile->getFilePath();
		}
		foreach ($assets as $asset) {
			$path = str_replace('media/', '', $asset['path']);
			$filePath = $assetsFilePaths[$path];
			$url = $dispatcher->url($request, ROUTE_PAGE, null, 'texture', 'media', null, array(
				'submissionId' => $submissionId,
				'fileId' => $fileId,
				'stageId' => $stageId,
				'fileName' => $path,
			));
			$infos[$asset['path']] = array(
				'encoding'  => 'url',
				'data'      => $url,
				'size'      => filesize($filePath),
				'createdAt' => filemtime($filePath),
				'updatedAt' => filectime($filePath),
			);
		}
		return $infos;
	}

	/**
	 * build manifest.xml from xml document
	 *
	 * @param $document string raw XML
	 * @param $assets array list of figure metadata
	 */
	protected function _buildManifestXMLFromDocument($manuscriptXml, &$assets) {
		$dom = new DOMDocument();
		if (!$dom->loadXML($manuscriptXml)) {
			fatalError("Unable to load XML document content in DOM in order to generate manifest XML.");
		}

		$k = 0;
		$assets = array();
		$figElements = $dom->getElementsByTagName('fig');
		foreach ($figElements as $figure) {
			$pos = $k+1;
			$figItem = $figElements->item($k);
			$graphic = $figItem->getElementsByTagName('graphic');

			// figure without graphic?
			if (!$figItem || !$graphic) {
				continue;
			}

			// get fig id
			$figId = null;
			if ($figItem->hasAttribute('id')) {
				$figId = $figItem->getAttribute('id');
			}
			else {
				$figId = "ojs-fig-{$pos}";
			}

			// get path
			$figGraphPath = $graphic->item(0)->getAttribute('xlink:href');

			// save assets
			$assets[] = array(
				'id'    => $figId,
				'type'  => 'image/jpg',
				'path'  => $figGraphPath,
			);

			$k++;
		}

		$sxml = simplexml_load_string('<dar><documents><document id="manuscript" type="article" path="manuscript.xml" /></documents><assets></assets></dar>');
		foreach ($assets as $asset) {
			$assetNode = $sxml->assets->addChild('asset');
			$assetNode->addAttribute('id', $asset['id']);
			$assetNode->addAttribute('type', $asset['type']);
			$assetNode->addAttribute('path', $asset['path']);
		}

		return $sxml->asXML();
	}

	/**
	 * display images attached to XML document
	 *
	 * @param $args array
	 * @param $request PKPRequest
	 *
	 * @return void
	 */
	public function media($args, $request) {
		$user = $request->getUser();
		$context = $request->getContext();
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		if (!$submissionFile) {
			fatalError('Invalid request');
		}

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		import('lib.pkp.classes.submission.SubmissionFile'); // Constants
		$dependentFiles = $submissionFileDao->getLatestRevisionsByAssocId(
			ASSOC_TYPE_SUBMISSION_FILE, 
			$submissionFile->getFileId(), 
			$submissionFile->getSubmissionId(), 
			SUBMISSION_FILE_DEPENDENT
		);

		// make sure this is an xml document
		if (!in_array($submissionFile->getFileType(), array('text/xml', 'application/xml'))) {
			fatalError('Invalid request');
		}

		$mediaSubmissionFile = null;
		foreach ($dependentFiles as $dependentFile) {
			if ($dependentFile->getOriginalFileName() == $request->getUserVar('fileName')) {
				$mediaSubmissionFile = $dependentFile;
				break;
			}
		}

		if (!$mediaSubmissionFile) {
			$request->getDispatcher()->handle404();
		}

		$filePath = $mediaSubmissionFile->getFilePath();
		header('Content-Type:'.$mediaSubmissionFile->getFileType());
		header('Content-Length: ' . $mediaSubmissionFile->getFileSize());
		readfile($filePath);
	}
}
