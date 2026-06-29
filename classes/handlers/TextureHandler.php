<?php

/**
 * @file plugins/generic/texture/classes/handlers/TextureHandler.php
 *
 * Copyright (c) 2014-2025 Simon Fraser University
 * Copyright (c) 2003-2025 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class TextureHandler
 *
 * @ingroup plugins_generic_texture
 *
 * @brief Handle requests for Texture plugin
 */

namespace APP\plugins\generic\texture\classes\handlers;

use APP\core\Application;
use APP\core\Services;
use APP\facades\Repo;
use APP\handler\Handler;
use APP\plugins\generic\texture\classes\DAR;
use APP\plugins\generic\texture\classes\XMLAmpersandEscaper;
use APP\plugins\generic\texture\TexturePlugin;
use APP\publication\Publication;
use APP\submission\Submission;
use APP\template\TemplateManager;
use DOMDocument;
use DOMXPath;
use Illuminate\Http\Response;
use PKP\db\DAORegistry;
use PKP\file\FileManager;
use PKP\security\authorization\WorkflowStageAccessPolicy;
use PKP\submission\GenreDAO;
use PKP\submissionFile\SubmissionFile;

class TextureHandler extends Handler
{
	public Submission $submission;
	public Publication $publication;
	public TexturePlugin $plugin;

	public function __construct(TexturePlugin $plugin)
	{
		parent::__construct();

		$this->plugin = $plugin;
		$this->addRoleAssignment(TexturePlugin::AUTHORIZED_ROLES,
			['editor', 'json']
		);
	}

	/**
	 * @copydoc PKPHandler::initialize()
	 */
	public function initialize($request, $args = null): void
	{
		parent::initialize($request);
		$this->submission = Repo::submission()->get((int)$request->getUserVar('submissionId'));
		$this->publication = $this->submission->getLatestPublication();
		$this->setupTemplate($request);
	}

	/**
	 * @copydoc PKPHandler::authorize()
	 */
	public function authorize($request, &$args, $roleAssignments): bool
	{
		$this->addPolicy(
			new WorkflowStageAccessPolicy(
				$request, $args, $roleAssignments, 'submissionId', WORKFLOW_STAGE_ID_PRODUCTION)
		);
		return parent::authorize($request, $args, $roleAssignments);
	}

	/**
	 * Display substance editor.
	 */
	public function editor($args, $request): string
	{
		$submissionFileId = (int)$request->getUserVar('submissionFileId');
		$submissionFile = Repo::submissionFile()->get($submissionFileId);
		$stageId = $submissionFile->getData('fileStage');
		$submissionId = $submissionFile->getData('submissionId');
		if (!$submissionId || !$stageId || !$submissionFileId) {
			return response(__('api.404.resourceNotFound'), Response::HTTP_NOT_FOUND);
		}

		$router = $request->getRouter();
		$documentUrl = $router->url($request, null, 'texture', 'json', null, [
			'submissionId' => $submissionId,
			'submissionFileId' => $submissionFileId,
			'stageId' => $stageId
		]);

		$templateMgr = TemplateManager::getManager($request);
		$templateMgr->assign([
			'documentUrl' => $documentUrl,
			'textureUrl' => $request->getBaseUrl() . '/' . $this->plugin->getPluginPath() . '/' . TexturePlugin::PLUGIN_URL,
			'texturePluginUrl' => $request->getBaseUrl() . '/' . $this->plugin->getPluginPath(),
			'title' => $this->publication->getLocalizedData('title') ?? __('plugins.generic.texture.name')
		]);

		return $templateMgr->fetch($this->plugin->getTemplateResource('editor.tpl'));
	}

	/**
	 * Fetch JSON archive.
	 */
	public function json($args, $request): string
	{
		$dar = new DAR();

		$submissionFileId = (int)$request->getUserVar('submissionFileId');
		$submissionFile = Repo::submissionFile()->get($submissionFileId);
		if (empty($submissionFile)) {
			return response(__('api.404.resourceNotFound'), Response::HTTP_NOT_FOUND);
		}

		if ($_SERVER["REQUEST_METHOD"] === "DELETE") {
			$postData = file_get_contents('php://input');
			$media = (array)json_decode($postData);
			if (empty($media)) {
				return response(__('api.404.resourceNotFound'), Response::HTTP_NOT_FOUND);
			}

			$dependentFilesIterator = Repo::submissionFile()->getCollector()
				->filterByAssoc(Application::ASSOC_TYPE_SUBMISSION_FILE, [$submissionFileId])
				->filterBySubmissionIds([$this->submission->getId()])
				->filterByFileStages([SubmissionFile::SUBMISSION_FILE_DEPENDENT])
				->includeDependentFiles()
				->getMany();

			foreach ($dependentFilesIterator as $dependentFile) {
				$fileName = $dependentFile->getLocalizedData('name');
				if ($fileName == $media['fileName']) {
					Repo::submissionFile()->delete($dependentFile->getId());
				}
			}

			return response(__('common.ok'), Response::HTTP_OK);
		}

		if ($_SERVER["REQUEST_METHOD"] === "GET") {
			if (!Services::get('file')->fs->fileExists($submissionFile->getData('path'))) {
				return response(__('plugins.generic.texture.error.fileNotFound'), Response::HTTP_NOT_FOUND);
			}
			$mediaBlob = $dar->createDarJson($dar, $request, $submissionFile);
			header('Content-Type: application/json');
			return json_encode($mediaBlob, JSON_UNESCAPED_SLASHES);
		}

		if ($_SERVER["REQUEST_METHOD"] === "PUT") {
			$postData = file_get_contents('php://input');
			if (empty($postData)) {
				return response(__('api.404.resourceNotFound'), Response::HTTP_NOT_FOUND);
			}

			$postDataJson = json_decode($postData);
			$resources = (isset($postDataJson->archive->resources)) ? (array)$postDataJson->archive->resources : [];
			//todo extract media correctly
			$media = isset($postDataJson->media) ? (array)$postDataJson->media : [];

			if (!empty($media) && array_key_exists("data", $media)) {
				$fileManager = new FileManager();
				$extension = $fileManager->parseFileExtension($media["fileName"]);
				$genreId = $this->getGenreId($request, $extension);
				if (!$genreId) {
					return response(__('api.404.resourceNotFound'), Response::HTTP_NOT_FOUND);
				}

				$mediaBlob = base64_decode(preg_replace('#^data:\w+/\w+;base64,#i', '', $media["data"]));
				$tempMediaFile = tempnam(sys_get_temp_dir(), 'texture');
				file_put_contents($tempMediaFile, $mediaBlob);

				$fileManager = new FileManager();
				$extension = $fileManager->parseFileExtension($media['fileName']);
				$submissionDir = Repo::submissionFile()->getSubmissionDir($request->getContext()->getData('id'), $this->submission->getId());
				$fileId = Services::get('file')->add($tempMediaFile, $submissionDir . '/' . bin2hex(random_bytes(32)) . '.' . $extension);
				unlink($tempMediaFile);

				$allowedLocales = $request->getContext()->getData('supportedSubmissionLocales');
				$newSubmissionFile = Repo::submissionFile()->newDataObject();
				$newSubmissionFile->setData('fileId', $fileId);
				$newSubmissionFile->setData('name', array_fill_keys(array_keys($allowedLocales), $media["fileName"]));
				$newSubmissionFile->setData('submissionId', $this->submission->getId());
				$newSubmissionFile->setData('uploaderUserId', $request->getUser()->getId());
				$newSubmissionFile->setData('assocType', Application::ASSOC_TYPE_SUBMISSION_FILE);
				$newSubmissionFile->setData('assocId', $submissionFile->getData('id'));
				$newSubmissionFile->setData('genreId', $this->getGenreId($request, $extension));
				$newSubmissionFile->setData('fileStage', SubmissionFile::SUBMISSION_FILE_DEPENDENT);

				Repo::submissionFile()->add($newSubmissionFile);
			} elseif (!empty($resources) && isset($resources[TexturePlugin::DAR_MANUSCRIPT_FILE]) && is_object($resources[TexturePlugin::DAR_MANUSCRIPT_FILE])) {
				$this->updateManuscriptFile($request, $resources, $this->submission, $submissionFile);
			}
		}

		return response(__('common.ok'), Response::HTTP_OK);
	}

	/**
	 * Get genre id.
	 */
	private function getGenreId($request, $extension): null|int
	{
		/** @var GenreDAO $genreDao */
		$genreDao = DAORegistry::getDAO('GenreDAO');
		$genres = $genreDao->getByDependenceAndContextId(true, $request->getJournal()->getId());

		while ($candidateGenre = $genres->next()) {
			if ($extension) {
				if ($candidateGenre->getKey() == 'IMAGE') {
					return $candidateGenre->getId();
				}
			} else {
				if ($candidateGenre->getKey() == 'MULTIMEDIA') {
					return $candidateGenre->getId();
				}
			}
		}

		return null;
	}

	/**
	 * Update manuscript XML file.
	 */
	private function updateManuscriptFile($request, $resources, $submission, $submissionFile): int
	{
		$modifiedDocument = new DOMDocument('1.0', 'utf-8');
		$modifiedData = $resources[TexturePlugin::DAR_MANUSCRIPT_FILE]->data;
		$context = $request->getContext();

		// write metadata back from the original file
		$modifiedDocument->loadXML($modifiedData);
		$xpath = new DOMXpath($modifiedDocument);

		if (!Services::get('file')->fs->fileExists($submissionFile->getData('path'))) {
			return 0;
		}
		$manuscriptXml = Services::get('file')->fs->read($submissionFile->getData('path'));
		$origDocument = new DOMDocument('1.0', 'utf-8');
		$modifiedData = XMLAmpersandEscaper::escapeAmpersands($modifiedData);
		$origDocument->loadXML($manuscriptXml);

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

		$tempName = tempnam(sys_get_temp_dir(), 'texture');
		file_put_contents($tempName, $origDocument->saveXML());
		$fileManager = new FileManager();
		$extension = $fileManager->parseFileExtension($submissionFile->getData('path'));
		$submissionDir = Repo::submissionFile()->getSubmissionDir($context->getData('id'), $submission->getData('id'));
		$fileId = (int)Services::get('file')->add($tempName, $submissionDir . '/' . uniqid() . '.' . $extension);

		Repo::submissionFile()->edit($submissionFile, [
			'fileId' => $fileId,
			'uploaderUserId' => $request->getUser()->getId()
		]);

		unlink($tempName);

		return $fileId;
	}
}
