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
import('lib.pkp.classes.file.SubmissionFileManager');

class TextureHandler extends Handler {
	/** @var MarkupPlugin The Texture plugin */
	protected $_plugin;


	/** @var Submission * */
	public $submission;

	/** @var Publication * */
	public $publication;


	/**
	 * Constructor
	 */
	function __construct() {

		parent::__construct();

		$this->_plugin = PluginRegistry::getPlugin('generic', TEXTURE_PLUGIN_NAME);
		$this->addRoleAssignment(
			array(ROLE_ID_MANAGER, ROLE_ID_SUB_EDITOR, ROLE_ID_ASSISTANT, ROLE_ID_REVIEWER, ROLE_ID_AUTHOR),
			array('editor', 'export', 'json', 'media', 'createGalleyForm', 'createGalley')
		);
	}

	//
	// Overridden methods from Handler
	//
	/**
	 * @copydoc PKPHandler::initialize()
	 */
	function initialize($request) {
		parent::initialize($request);
		$this->submission = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION);
		$this->publication = $this->submission->getLatestPublication();
		$this->setupTemplate($request);
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
	 * Create galley form
	 * @param $args array
	 * @param $request PKPRequest
	 * @return JSONMessage JSON object
	 */
	public function createGalleyForm($args, $request) {
		import('plugins.generic.texture.controllers.grid.form.TextureArticleGalleyForm');
		$galleyForm = new TextureArticleGalleyForm(
			$request, $this->getPlugin(), $this->publication, $this->submission
		);

		$galleyForm->initData();
		return new JSONMessage(true, $galleyForm->fetch($request));
	}

	/**
	 * @param $args
	 * @param $request PKPRequest
	 * @return
	 */
	public function export($args, $request) {
		import('plugins.generic.texture.classes.DAR');
		$dar = new DAR();

		$context = $request->getContext();
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);

		$fileManager = $this->_getFileManager($context->getId(), $submissionFile->getId());
		$filesDir = $fileManager->getBasePath();

		$filePath = $submissionFile->getFilePath();
		$archivePath = tempnam('/tmp', 'texture-');
		if (self::zipFunctional()) {
			$zipTest = true;
			$zip = new ZipArchive();
			if ($zip->open($archivePath, ZIPARCHIVE::CREATE) == true) {
				$zip->addFile($filePath,basename($filePath));
				$zip->close();
			}
		}


		if (file_exists($archivePath)) {

			$fileManager->downloadByPath($archivePath, 'application/x-zip', false, 'files.dar');
			$fileManager->deleteByPath($archivePath);
		} else {
			fatalError('Creating archive with submission files failed!');
		}

	}

	/**
	 * return the application specific file manager.
	 * @param $contextId int the context for this manager.
	 * @param $submissionId int the submission id.
	 * @return SubmissionFileManager
	 */
	function _getFileManager($contextId, $submissionId) {
		return new SubmissionFileManager($contextId, $submissionId);
	}


	/**
	 * @param $args
	 * @param $request PKPRequest
	 * @return JSONMessage
	 */
	public function createGalley($args, $request) {
		import('plugins.generic.texture.controllers.grid.form.TextureArticleGalleyForm');
		$galleyForm = new TextureArticleGalleyForm($request, $this->getPlugin(), $this->publication, $this->submission);
		$galleyForm->readInputData();

		if ($galleyForm->validate()) {

			$galleyForm->execute();
			return $request->redirectUrlJson($request->getDispatcher()->url($request, ROUTE_PAGE, null, 'workflow', 'access', null,
				array(
					'submissionId' => $request->getUserVar('submissionId'),
					'stageId' => $request->getUserVar('stageId')
				)
			));

		}

		return new JSONMessage(false);
	}

	/**
	 * Display substance editor
	 *
	 * @param $args array
	 * @param $request PKPRequest
	 * @return string
	 */
	public function editor($args, $request) {
		$stageId = (int)$request->getUserVar('stageId');
		$fileId = (int)$request->getUserVar('fileId');
		$submissionId = (int)$request->getUserVar('submissionId');;
		if (!$submissionId || !$stageId || !$fileId) {
			fatalError('Invalid request');
		}

		$editorTemplateFile = method_exists($this->_plugin, 'getTemplateResource') ? $this->_plugin->getTemplateResource('editor.tpl') : ($this->_plugin->getTemplateResourceName() . ':templates/editor.tpl');
		$router = $request->getRouter();
		$documentUrl = $router->url($request, null, 'texture', 'json', null,
			array(
				'submissionId' => $submissionId,
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
	 * @return JSONMessage
	 */
	public function json($args, $request) {

		import('plugins.generic.texture.classes.DAR');
		$dar = new DAR();
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
			$removeElements = array("/article/front/journal-meta", "/article/front/article-meta/self-uri");
			$filePath = $submissionFile->getFilePath();
			$manuscriptXml = file_get_contents($filePath);
			$manifestXml = $dar->createManifest($manuscriptXml, $assets);
			$manuscriptXml = $dar->removeElements($manuscriptXml, $removeElements);
			$mediaInfos = $dar->createMediaInfo($request, $assets);

			$filesize = filesize($filePath);
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
					'data' => $manuscriptXml->saveXML(),
					'size' => $filesize,
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

				$postDataJson = json_decode($postData);
				$resources = (isset($postDataJson->archive) && isset($postDataJson->archive->resources)) ? (array)$postDataJson->archive->resources : [];
				$media = isset($postDataJson->media) ? (array)$postDataJson->media : [];

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
	 * Get the plugin.
	 * @return TexuturePlugin
	 */
	function getPlugin() {
		return $this->_plugin;
	}

	/**
	 * Return true if the zip extension is loaded.
	 * @return boolean
	 */
	static function zipFunctional() {
		return (extension_loaded('zip'));
	}


}
