<?php

/**
 * @file plugins/generic/texture/TextureHandler.inc.php
 *
 * Copyright (c) 2014-2019 Simon Fraser University
 * Copyright (c) 2003-2019 John Willinsky
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
		$stageId = (int)$request->getUserVar('stageId');

		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		if (!$submissionFile) {
			fatalError('Invalid request');
		}

		$fileId = $submissionFile->getFileId();
		$editorTemplateFile = method_exists($this->_plugin, 'getTemplateResource') ? $this->_plugin->getTemplateResource('editor.tpl') : ($this->_plugin->getTemplateResourceName() . ':templates/editor.tpl');
		$router = $request->getRouter();
		$documentUrl = $router->url($request, null, 'texture', 'json', null,
			array(
				'submissionId' => $submissionFile->getSubmissionId(),
				'fileId' => $fileId,
				'stageId' => $stageId,
			)
		);

		AppLocale::requireComponents(LOCALE_COMPONENT_APP_COMMON, LOCALE_COMPONENT_PKP_MANAGER);
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

		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);

		if (!$submissionFile) {
			fatalError('Invalid request');
		}

		if (empty($submissionFile)) {
			echo __('plugins.generic.texture.archive.noArticle'); // TODO custom message
			exit;
		}

		if ($_SERVER["REQUEST_METHOD"] === "DELETE") {
			$postData = file_get_contents('php://input');
			$media = (array)json_decode($postData);
			if (!empty($media)) {
				$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
				$dependentFiles = $submissionFileDao->getLatestRevisionsByAssocId(
					ASSOC_TYPE_SUBMISSION_FILE,
					$submissionFile->getFileId(),
					$submissionFile->getSubmissionId(),
					SUBMISSION_FILE_DEPENDENT
				);
				foreach ($dependentFiles as $dependentFile) {
					if ($dependentFile->getOriginalFileName() === $media['fileName']) {
						$fileId = $dependentFile->getFileId();
						$submissionId = (int)$request->getUserVar('submissionId');
						$fileStage = $dependentFile->getFileStage();
						$fileRevision = $submissionFileDao->deleteLatestRevisionById($fileId, $fileStage, $submissionId);
						if ($fileRevision > 0) {
							return new JSONMessage(true, array(
								'submissionId' => $submissionId,
								'fileId' => $submissionId,
								'fileRevision' => $fileRevision,
								'delete_stauts' => true
							));
						} else {
							return new JSONMessage(false);
						}
						break;
					}
				}
			}
		}

		if ($_SERVER["REQUEST_METHOD"] === "GET") {
			$assets = array();
			$filePath = $submissionFile->getFilePath();
			$manuscriptXml = file_get_contents($filePath);
			$manifestXml = $this->_buildManifestXMLFromDocument($manuscriptXml, $assets);
			$manuscriptXmlDom = $this->_removeElements($manuscriptXml);
			$mediaInfos = $this->_buildMediaInfo($request, $assets);
			$resources = array(
				'manifest.xml' => array(
					'encoding' => 'utf8',
					'data' => $manifestXml,
					'size' => strlen($manifestXml),
					'createdAt' => 0,
					'updatedAt' => 0,
				),
				'manuscript.xml' => array(
					'encoding' => 'utf8',
					'data' => $manuscriptXmlDom->saveXML(),
					'size' => filesize($filePath),
					'createdAt' => 0,
					'updatedAt' => 0,
				),
			);
			$mediaBlob = array(
				'version' => $submissionFile->getSourceRevision(),
				'resources' => array_merge($resources, $mediaInfos)
			);
			header('Content-Type: application/json');
			return json_encode($mediaBlob, JSON_UNESCAPED_SLASHES);
		} elseif ($_SERVER["REQUEST_METHOD"] === "PUT") {

			$postData = file_get_contents('php://input');

			if (!empty($postData)) {
				$submissionDao = Application::getSubmissionDAO();
				$submissionId = (int)$request->getUserVar('submissionId');
				$submission = $submissionDao->getById($submissionId);

				$resources = (array)json_decode($postData)->archive->resources;
				$media = (array)json_decode($postData)->media;

				if (!empty($media)) {
					import('classes.file.PublicFileManager');
					$publicFileManager = new PublicFileManager();


					$journal = $request->getJournal();
					$genreDao = DAORegistry::getDAO('GenreDAO');
					$genres = $genreDao->getByDependenceAndContextId(true, $journal->getId());
					$genreId = null;
					$extension = $publicFileManager->getImageExtension($media["fileType"]);
					while ($candidateGenre = $genres->next()) {
						if ($extension) {
							if ($candidateGenre->getKey() == 'IMAGE') {
								$genreId = $candidateGenre->getId();
								break;
							}
						} else {
							if ($candidateGenre->getKey() == 'MULTIMEDIA') {
								$genreId = $candidateGenre->getId();
								break;

							}
						}
					}
					if (!$genreId) {
						// Could not identify the genre -- it's an error condition
						return new JSONMessage(false);
					}

					$user = $request->getUser();
					$insertedSubmissionFile = $this->_createDependentFile($genreId, $media, $submission, $submissionFile, $user);


				} elseif (!empty($resources) && isset($resources['manuscript.xml']) && is_object($resources['manuscript.xml'])) {
					$genreId = $submissionFile->getGenreId();
					$fileStage = $submissionFile->getFileStage();
					$user = $request->getUser();

					$insertedSubmissionFile = $this->_updateManuscriptFile($fileStage, $genreId, $resources, $submission, $submissionFile, $user);

				} else {
					return new JSONMessage(false);
				}

				return new JSONMessage(true, array(
					'submissionId' => $insertedSubmissionFile->getSubmissionId(),
					'fileId' => $insertedSubmissionFile->getFileIdAndRevision(),
					'fileStage' => $insertedSubmissionFile->getFileStage(),
				));

			}

		} else {
			return new JSONMessage(false);
		}
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
				'encoding' => 'url',
				'data' => $url,
				'size' => filesize($filePath),
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
			$pos = $k + 1;
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
			} else {
				$figId = "ojs-fig-{$pos}";
			}

			// get path
			$figGraphPath = $graphic->item(0)->getAttribute('xlink:href');

			// save assets
			$assets[] = array(
				'id' => $figId,
				'type' => 'image/jpg',
				'path' => $figGraphPath,
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
		header('Content-Type:' . $mediaSubmissionFile->getFileType());
		header('Content-Length: ' . $mediaSubmissionFile->getFileSize());
		readfile($filePath);
	}

	/**
	 * creates dependent file
	 * @param $genreId intr
	 * @param $mediaData string
	 * @param $submission Article
	 * @param $submissionFile SubmissionFie
	 * @param $user User
	 * @return SubmissionArtworkFile
	 */
	protected function _createDependentFile($genreId, $mediaData, $submission, $submissionFile, $user) {
		$mediaBlob = base64_decode(preg_replace('#^data:\w+/\w+;base64,#i', '', $mediaData["data"]));
		$tmpfname = tempnam(sys_get_temp_dir(), 'texture');
		file_put_contents($tmpfname, $mediaBlob);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$newMediaFile = $submissionFileDao->newDataObjectByGenreId($genreId);
		$newMediaFile->setSubmissionId($submission->getId());
		$newMediaFile->setSubmissionLocale($submission->getLocale());
		$newMediaFile->setGenreId($genreId);
		$newMediaFile->setFileStage(SUBMISSION_FILE_DEPENDENT);
		$newMediaFile->setDateUploaded(Core::getCurrentDate());
		$newMediaFile->setDateModified(Core::getCurrentDate());
		$newMediaFile->setUploaderUserId($user->getId());
		$newMediaFile->setFileSize(filesize($tmpfname));
		$newMediaFile->setFileType($mediaData["fileType"]);
		$newMediaFile->setAssocId($submissionFile->getFileId());
		$newMediaFile->setAssocType(ASSOC_TYPE_SUBMISSION_FILE);
		$newMediaFile->setOriginalFileName($mediaData["fileName"]);
		$insertedMediaFile = $submissionFileDao->insertObject($newMediaFile, $tmpfname);

		unlink($tmpfname);

		return $insertedMediaFile;
	}

	/**
	 * Update manuscript XML file
	 * @param $fileStage int
	 * @param $genreId int
	 * @param $resources  array
	 * @param $submission Article
	 * @param $submissionFile SubmissionFile
	 * @param $user User
	 * @return SubmissionFile
	 */
	protected function _updateManuscriptFile($fileStage, $genreId, $resources, $submission, $submissionFile, $user) {
		$manuscriptXml = $resources['manuscript.xml']->data;
		$tmpfname = tempnam(sys_get_temp_dir(), 'texture');
		file_put_contents($tmpfname, $manuscriptXml);


		$fileSize = filesize($tmpfname);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$newSubmissionFile = $submissionFileDao->newDataObjectByGenreId($genreId);

		$newSubmissionFile->setSubmissionId($submission->getId());
		$newSubmissionFile->setSubmissionLocale($submission->getLocale());
		$newSubmissionFile->setGenreId($genreId);
		$newSubmissionFile->setFileStage($fileStage);
		$newSubmissionFile->setDateUploaded(Core::getCurrentDate());
		$newSubmissionFile->setDateModified(Core::getCurrentDate());
		$newSubmissionFile->setOriginalFileName($submissionFile->getOriginalFileName());
		$newSubmissionFile->setUploaderUserId($user->getId());
		$newSubmissionFile->setFileSize($fileSize);
		$newSubmissionFile->setFileType($submissionFile->getFileType());
		$newSubmissionFile->setSourceFileId($submissionFile->getFileId());
		$newSubmissionFile->setSourceRevision($submissionFile->getRevision());
		$newSubmissionFile->setFileId($submissionFile->getFileId());
		$newSubmissionFile->setRevision($submissionFile->getRevision() + 1);
		$insertedSubmissionFile = $submissionFileDao->insertObject($newSubmissionFile, $tmpfname);

		unlink($tmpfname);

		return $insertedSubmissionFile;
	}

	/**
	 * @param $manuscriptXml
	 * @return DOMDocument
	 */
	private function _removeElements($manuscriptXml) {
		$elementsPath = array("/article/front/journal-meta", "/article/front/article-meta/self-uri");

		$manuscriptXmlDom = new DOMDocument;
		$manuscriptXmlDom->loadXML($manuscriptXml);
		$xpath = new DOMXpath($manuscriptXmlDom);

		foreach ($elementsPath as $elementPath) {
			$elements = $xpath->query($elementPath);
			foreach ($elements as $element) {
				$element->parentNode->removeChild($element);
			}
		}
		return $manuscriptXmlDom;
	}
}
