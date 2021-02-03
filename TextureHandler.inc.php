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
			array('editor', 'export', 'json', 'extract', 'media', 'createGalleyForm', 'createGalley')
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
		$submissionFileId = $request->getUserVar('fileId');

		import('lib.pkp.classes.security.authorization.WorkflowStageAccessPolicy');
		$this->addPolicy(new WorkflowStageAccessPolicy($request, $args, $roleAssignments, 'submissionId', WORKFLOW_STAGE_ID_PRODUCTION));

		import('lib.pkp.classes.security.authorization.PublicationAccessPolicy');
		$this->addPolicy(new PublicationAccessPolicy($request, $args, $roleAssignments));


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
		$galleyForm = new TextureArticleGalleyForm($request, $this->getPlugin(), $this->publication, $this->submission);

		$galleyForm->initData();
		return new JSONMessage(true, $galleyForm->fetch($request));
	}

	/**
	 * Extracts a DAR Archive
	 * @param $args
	 * @param $request
	 */
	public function extract($args, $request) {

		import('lib.pkp.classes.file.SubmissionFileManager');
		$user = $request->getUser();
		$zipType = $request->getUserVar("zipType");
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		$archivePath = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'texture-' . $zipType . '-archive' . mt_rand();
		$image_types = array('gif', 'jpg', 'jpeg', 'png', 'jpe');
		$html_types = array('html');

		$zip = new ZipArchive;
		if ($zip->open($submissionFile->getData('path')) === TRUE) {
			$submissionDao = Application::getSubmissionDAO();
			$submissionId = (int)$request->getUserVar('submissionId');
			$submission = $submissionDao->getById($submissionId);
			mkdir($archivePath, 0777, true);
			$zip->extractTo($archivePath);
			$genreId = GENRE_CATEGORY_DOCUMENT;
			$fileStage = $submissionFile->getFileStage();
			$sourceFileId = $submissionFile->getData('fileId');
			if ($zipType == TEXTURE_DAR_FILE_TYPE) {
				$manifestFileDom = new DOMDocument();
				$darManifestFilePath = $archivePath . DIRECTORY_SEPARATOR . DAR_MANIFEST_FILE;
				if (file_exists($darManifestFilePath)) {

					$manifestFileDom->load($darManifestFilePath);
					$documentNodeList = $manifestFileDom->getElementsByTagName("document");
					if ($documentNodeList->length == 1) {

						$darManuscriptFilePath = $archivePath . DIRECTORY_SEPARATOR . $documentNodeList[0]->getAttribute('path');

						if (file_exists($darManuscriptFilePath)) {

							$fileType = "text/xml";

							$clientFileName = basename($submissionFile->getClientFileName(), TEXTURE_DAR_FILE_TYPE) . 'xml';
							$fileSize = filesize($darManuscriptFilePath);

							$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
							$newSubmissionFile = $submissionFileDao->newDataObjectByGenreId($genreId);
							$newSubmissionFile->setSubmissionId($submission->getId());
							$newSubmissionFile->setSubmissionLocale($submission->getLocale());
							$newSubmissionFile->setGenreId($genreId);
							$newSubmissionFile->setFileStage($fileStage);
							$newSubmissionFile->setDateUploaded(Core::getCurrentDate());
							$newSubmissionFile->setDateModified(Core::getCurrentDate());
							$newSubmissionFile->setOriginalFileName($clientFileName);
							$newSubmissionFile->setUploaderUserId($user->getId());
							$newSubmissionFile->setFileSize($fileSize);
							$newSubmissionFile->setFileType($fileType);

							$newSubmissionFile->setSourceRevision($submissionFile->getRevision());
							$newSubmissionFile->setSourceFileId($sourceFileId);

							$insertedSubmissionFile = $submissionFileDao->insertObject($newSubmissionFile, $darManuscriptFilePath);

							$dependentFiles = $manifestFileDom->getElementsByTagName("asset");
							foreach ($dependentFiles as $asset) {

								$fileName = $asset->getAttribute('path');
								$dependentFilePath = $archivePath . DIRECTORY_SEPARATOR . $fileName;
								$fileType = pathinfo($fileName, PATHINFO_EXTENSION);

								$genreId = $this->_getGenreId($request, $fileType);
								$this->_createDependentFile($genreId, $submission, $insertedSubmissionFile, $user, $fileType, $fileName, SUBMISSION_FILE_DEPENDENT, ASSOC_TYPE_SUBMISSION_FILE, false, true, $insertedSubmissionFile->getFileId(), false, $dependentFilePath);
							}
						} else {
							return $this->removeFilesAndNotify($zip, $archivePath, $user, __('plugins.generic.texture.notification.noManuscript'));
						}
					}

				} else {
					return $this->removeFilesAndNotify($zip, $archivePath, $user, __('plugins.generic.texture.notification.noManifest'));
				}
			} elseif ($zipType == TEXTURE_ZIP_FILE_TYPE) {

				$archiveContent = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($archivePath), RecursiveIteratorIterator::SELF_FIRST);

				$productionFiles = [];
				$dependentFiles = [];

				{
					foreach ($archiveContent as $fileName => $fileObject) {

						if (in_array(pathinfo($fileName, PATHINFO_EXTENSION), $image_types)) {
							array_push($dependentFiles, $fileObject);
						}
						if (in_array(pathinfo($fileName, PATHINFO_EXTENSION), $html_types)) {
							array_push($productionFiles, $fileObject);
						}

					}
					if (count($productionFiles) == 1) {

						$htmlFile = $productionFiles[0];
						$fileType = "text/html";

						$clientFileName = basename($submissionFile->getClientFileName(), TEXTURE_ZIP_FILE_TYPE) . 'html';
						$fileSize = $htmlFile->getSize();
						$filePath = $htmlFile->getPathname();

						$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
						$newSubmissionFile = $submissionFileDao->newDataObjectByGenreId($genreId);
						$newSubmissionFile->setSubmissionId($submission->getId());
						$newSubmissionFile->setSubmissionLocale($submission->getLocale());
						$newSubmissionFile->setGenreId($genreId);
						$newSubmissionFile->setFileStage($fileStage);
						$newSubmissionFile->setDateUploaded(Core::getCurrentDate());
						$newSubmissionFile->setDateModified(Core::getCurrentDate());
						$newSubmissionFile->setUploaderUserId($user->getId());
						$newSubmissionFile->setFileSize($fileSize);
						$newSubmissionFile->setFileType($fileType);

						$newSubmissionFile->setOriginalFileName($clientFileName);
						$newSubmissionFile->setSourceRevision($submissionFile->getRevision());
						$newSubmissionFile->setSourceFileId($sourceFileId);
						$insertedSubmissionFile = $submissionFileDao->insertObject($newSubmissionFile, $filePath);

						foreach ($dependentFiles as $asset) {

							$genreId = $this->_getGenreId($request, $asset->getType());
							$this->_createDependentFile($genreId, $submission, $insertedSubmissionFile, $user, $asset->getType(), $asset->getFileName(), SUBMISSION_FILE_DEPENDENT, ASSOC_TYPE_SUBMISSION_FILE, false, true, $insertedSubmissionFile->getFileId(), $sourceFileId, $asset->getPathname());
						}

					} else {

						return $this->removeFilesAndNotify($zip, $archivePath, $user, __('plugins.generic.texture.notification.noValidHTMLFile'));
					}


				}


			}
		} else {
			return $this->removeFilesAndNotify($zip, $archivePath, $user, __('plugins.generic.texture.notification.noValidDarFile'));
		}

		return $this->removeFilesAndNotify($zip, $archivePath, $user, __('plugins.generic.texture.notification.extracted'), NOTIFICATION_TYPE_SUCCESS, true);
	}

	/**
	 * Exports a DAR Archive
	 * @param $args
	 * @param $request PKPRequest
	 * @return
	 */
	public function export($args, $request) {

		import('plugins.generic.texture.classes.DAR');
		$dar = new DAR();
		$assets = array();

		$context = $request->getContext();
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		$filePath = $submissionFile->getData('path');
		$manuscriptXml = file_get_contents($filePath);
		$manifestXml = $dar->createManifest($manuscriptXml, $assets);

		$submissionId = $request->getUserVar('submissionId');
		$fileManager = $this->_getFileManager($context->getId(), $submissionFile->getId());
		$assetsFilePaths = $dar->getDependentFilePaths($submissionId, $submissionFile->getId());

		$archivePath = tempnam('/tmp', 'texture-');
		if (self::zipFunctional()) {
			$zip = new ZipArchive();

			if ($zip->open($archivePath, ZIPARCHIVE::CREATE) == true) {
				$zip->addFile($filePath, DAR_MANUSCRIPT_FILE);
				$zip->addFromString(DAR_MANIFEST_FILE, $manifestXml);
				foreach ($assetsFilePaths as $name => $path) {
					$zip->addFile($path, $name);
				}
				$zip->close();
			}
		}

		if (file_exists($archivePath)) {
			$fileManager->downloadByPath($archivePath, 'application/x-zip', false, pathinfo($filePath, PATHINFO_FILENAME) . '.dar');
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
		$submission = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION);
		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		$filePath = $submissionFile->getData('path');
		$manuscriptXml = file_get_contents($filePath);
		$manuscriptXmlDom = new DOMDocument;
		$manuscriptXmlDom->loadXML($manuscriptXml);
		$editorTemplateFile = method_exists($this->_plugin, 'getTemplateResource') ? $this->_plugin->getTemplateResource('editor.tpl') : ($this->_plugin->getTemplateResourceName() . ':templates/editor.tpl');
		$router = $request->getRouter();
		$documentUrl = $router->url($request, null, 'texture', 'json', null,
			array(
				'submissionId' => $submissionId,
				'fileId' => $fileId,
				'stageId' => $stageId
			)
		);

		AppLocale::requireComponents(LOCALE_COMPONENT_APP_COMMON, LOCALE_COMPONENT_PKP_MANAGER);
		$templateMgr = TemplateManager::getManager($request);
		$publication = $submission->getCurrentPublication();
		$title = $publication->getLocalizedData('title') ?? __('plugins.generic.texture.name');

		$templateMgr->assign(array(
			'documentUrl' => $documentUrl,
			'textureUrl' => $this->_plugin->getTextureUrl($request),
			'texturePluginUrl' => $this->_plugin->getPluginUrl($request),
			'title' => $title
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
				$dependentFiles = Services::get('submissionFile')->getMany([
					'assocTypes' => [ASSOC_TYPE_SUBMISSION_FILE],
					'assocIds' => [$submissionFile->getData('fileId')],
					'submissionIds' => [$submissionFile->getData('submissionId')],
					'fileStages' => [SUBMISSION_FILE_DEPENDENT],
					'includeDependentFiles' => true,
				]);
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
			$mediaBlob = $dar->construct($dar, $request, $submissionFile);
			header('Content-Type: application/json');

			return json_encode($mediaBlob, JSON_UNESCAPED_SLASHES);
		} elseif ($_SERVER["REQUEST_METHOD"] === "PUT") {
			$postData = file_get_contents('php://input');

			if (!empty($postData)) {
				$submissionDao = Application::getSubmissionDAO();
				$submissionId = (int)$request->getUserVar('submissionId');
				$user = $request->getUser();
				$submission = $submissionDao->getById($submissionId);

				$postDataJson = json_decode($postData);
				$resources = (isset($postDataJson->archive) && isset($postDataJson->archive->resources)) ? (array)$postDataJson->archive->resources : [];
				$media = isset($postDataJson->media) ? (array)$postDataJson->media : [];

				if (!empty($media)) {
					import('classes.file.PublicFileManager');
					$publicFileManager = new PublicFileManager();

					$genreId = null;
					$extension = $publicFileManager->getImageExtension($media["fileType"]);
					$genreId = $this->_getGenreId($request, $extension);
					if (!$genreId) {
						// Could not identify the genre -- it's an error condition
						return new JSONMessage(false);
					}

					$mediaBlob = base64_decode(preg_replace('#^data:\w+/\w+;base64,#i', '', $media["data"]));
					$tmpfname = tempnam(sys_get_temp_dir(), 'texture');
					file_put_contents($tmpfname, $mediaBlob);
					$fileType = $media["fileType"];
					$fileName = $media["fileName"];

					$insertedSubmissionFile = $this->_createDependentFile($genreId, $submission, $submissionFile, $user, $fileType, $fileName, SUBMISSION_FILE_DEPENDENT, ASSOC_TYPE_SUBMISSION_FILE, false, true, $submissionFile->getData('fileId'), false, $tmpfname);

				} elseif (!empty($resources) && isset($resources[DAR_MANUSCRIPT_FILE]) && is_object($resources[DAR_MANUSCRIPT_FILE])) {
					$genreId = $submissionFile->getGenreId();
					$fileStage = $submissionFile->getFileStage();

					$insertedSubmissionFile = $this->_updateManuscriptFile($fileStage, $genreId, $resources, $submission, $submissionFile, $user);
				} else {
					return new JSONMessage(false);
				}

				return new JSONMessage(true);
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

		$submissionFile = $this->getAuthorizedContextObject(ASSOC_TYPE_SUBMISSION_FILE);
		if (!$submissionFile) {
			fatalError('Invalid request');
		}

		$dependentFiles = Services::get('submissionFile')->getMany([
			'assocTypes' => [ASSOC_TYPE_SUBMISSION_FILE],
			'assocIds' => [$submissionFile->getData('fileId')],
			'submissionIds' => [$submissionFile->getData('submissionId')],
			'fileStages' => [SUBMISSION_FILE_DEPENDENT],
			'includeDependentFiles' => true,
		]);




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

		$modifiedDocument =  new DOMDocument('1.0', 'utf-8');
		$modifiedData = $resources[DAR_MANUSCRIPT_FILE]->data;

		$modifiedDocument->loadXML($modifiedData);
		$xpath = new DOMXpath($modifiedDocument);

		$origDocument = new DOMDocument('1.0', 'utf-8');
		$origDocument->loadXML(file_get_contents($submissionFile->getData('path')));


		$body = $origDocument->documentElement->getElementsByTagName('body')->item(0);
		$origDocument->documentElement->removeChild($body);

		$manuscriptBody = $xpath->query("//article/body");
		foreach ($manuscriptBody as $content) {
			$node = $origDocument->importNode($content, true);
			$origDocument->documentElement->appendChild($node);
		}

		$back = $origDocument->documentElement->getElementsByTagName('back')->item(0);
		$origDocument->documentElement->removeChild($back);

		$manuscriptBack = $xpath->query("//article/back");
		foreach ($manuscriptBack as $content) {
			$node = $origDocument->importNode($content, true);
			$origDocument->documentElement->appendChild($node);
		}

		$editedManuscriptXML = $origDocument->saveXML();
		$tmpfname = tempnam(sys_get_temp_dir(), 'texture');
		file_put_contents($tmpfname, $editedManuscriptXML);

		$fileType = $submissionFile->getFileType();
		$fileName = $submissionFile->getOriginalFileName();

		$fileSize = filesize($tmpfname);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$newSubmissionFile = $submissionFileDao->newDataObjectByGenreId($genreId);
		$newSubmissionFile->setSubmissionId($submission->getId());
		$newSubmissionFile->setSubmissionLocale($submission->getLocale());
		$newSubmissionFile->setGenreId($genreId);
		$newSubmissionFile->setFileStage($fileStage);
		$newSubmissionFile->setDateUploaded(Core::getCurrentDate());
		$newSubmissionFile->setDateModified(Core::getCurrentDate());
		$newSubmissionFile->setUploaderUserId($user->getId());
		$newSubmissionFile->setFileSize($fileSize);
		$newSubmissionFile->setFileType($fileType);

		$newSubmissionFile->setOriginalFileName($fileName);
		$newSubmissionFile->setSourceRevision($submissionFile->getRevision());

		$newSubmissionFile->setFileId($submissionFile->getData('fileId'));
		$newSubmissionFile->setSourceFileId($submissionFile->getData('fileId'));
		$newSubmissionFile->setRevision($submissionFile->getRevision() + 1);
		$insertedSubmissionFile = $submissionFileDao->insertObject($newSubmissionFile, $tmpfname);
		unlink($tmpfname);

		return $insertedSubmissionFile;
	}

	/**
	 * Creates a dependent file
	 *
	 * @param $genreId  int
	 * @param $submission Submission
	 * @param $submissionFile SubmissionFile
	 * @param $user User
	 * @param $fileType string
	 * @param $fileName string
	 * @param bool $fileStage
	 * @param bool $assocType
	 * @param bool $sourceRevision
	 * @param bool $deletePath
	 * @param bool $assocId
	 * @param bool $sourceFileId
	 * @param $filePath string
	 * @return void
	 */
	protected function _createDependentFile($genreId, $submission, $submissionFile, $user, $fileType, $fileName, $fileStage = false, $assocType = false, $sourceRevision = false, $deletePath = false, $assocId = false, $sourceFileId = false, $filePath=false) {

		$fileSize = filesize($filePath);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$newFile = $submissionFileDao->newDataObjectByGenreId($genreId);
		$newFile->setSubmissionId($submission->getId());
		$newFile->setSubmissionLocale($submission->getLocale());
		$newFile->setGenreId($genreId);
		$newFile->setFileStage($fileStage);
		$newFile->setDateUploaded(Core::getCurrentDate());
		$newFile->setDateModified(Core::getCurrentDate());
		$newFile->setUploaderUserId($user->getId());
		$newFile->setFileSize($fileSize);
		$newFile->setFileType($fileType);

		if (isset($fileName)) $newFile->setOriginalFileName($fileName);
		if (isset($assocType)) $newFile->setAssocType($assocType);
		if (isset($sourceRevision)) $newFile->setSourceRevision($sourceRevision);
		if (isset($assocId)) $newFile->setAssocId($assocId);
		if (isset($sourceFileId)) $newFile->setSourceFileId($sourceFileId);

		$insertedMediaFile = $submissionFileDao->insertObject($newFile, $filePath);
		if ($deletePath) unlink($filePath);

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

	/**
	 * @param $genres
	 * @param $extension
	 * @return mixed
	 */
	private function _getGenreId($request, $extension) {

		$journal = $request->getJournal();
		$genreDao = DAORegistry::getDAO('GenreDAO');
		$genres = $genreDao->getByDependenceAndContextId(true, $journal->getId());

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
		return $genreId;
	}

	/**
	 * Delete folder and its contents
	 * @note Adapted from https://www.php.net/manual/de/function.rmdir.php#117354
	 */
	private function rrmdir($src) {

		$dir = opendir($src);
		while (false !== ($file = readdir($dir))) {
			if (($file != '.') && ($file != '..')) {
				$full = $src . '/' . $file;
				if (is_dir($full)) {
					$this->rrmdir($full);
				} else {
					unlink($full);
				}
			}
		}
		closedir($dir);
		rmdir($src);
	}

	/**
	 * Remove files and notify
	 * @param ZipArchive $zip
	 * @param string $archivePath
	 * @param $user
	 * @param  $message
	 * @param $errorType
	 * @param bool $status
	 * @return JSONMessage
	 */
	private function removeFilesAndNotify(ZipArchive $zip, string $archivePath, $user, $message, $errorType = NOTIFICATION_TYPE_ERROR, $status = False): JSONMessage {

		$notificationMgr = new NotificationManager();
		$zip->close();
		$this->rrmdir($archivePath);
		$notificationMgr->createTrivialNotification($user->getId(), $errorType, array('contents' => $message));
		return new JSONMessage($status);
	}

}
