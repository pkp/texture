<?php

/**
 * @file plugins/generic/texture/controllers/grid/form/TextureArticleGalleyForm.inc.php
 *
 * Copyright (c) 2014-2019 Simon Fraser University
 * Copyright (c) 2003-2019 John Willinsky
 * Distributed under the GNU GPL v2. For full terms see the file docs/COPYING.
 *
 * @class TextureArticleGalleyForm
 *
 * @see ArticleGalleyForm
 *
 * @brief Article galley editing form.
 */

import('lib.pkp.classes.form.Form');

class TextureArticleGalleyForm extends Form
{
	/** @var the $_submission */
	var $_submission = null;

	/** @var Publication */
	var $_publication = null;


	/**
	 * Constructor.
	 * @param $request Request
	 * @param $plugin Plugin
	 * @param $publication
	 * @param $submission Submission
	 */
	function __construct($request, $plugin, $publication, $submission)
	{
		$this->_submission = $submission;
		$this->_publication = $publication;

		parent::__construct($plugin->getTemplateResource('TextureArticleGalley.tpl'));

		AppLocale::requireComponents(LOCALE_COMPONENT_APP_EDITOR, LOCALE_COMPONENT_PKP_SUBMISSION);

		$this->addCheck(new FormValidator($this, 'label', 'required', 'editor.issues.galleyLabelRequired'));
		$this->addCheck(new FormValidatorPost($this));
		$this->addCheck(new FormValidatorCSRF($this));

		// Ensure a locale is provided and valid
		$journal = $request->getJournal();
		$this->addCheck(
			new FormValidator(
				$this,
				'galleyLocale',
				'required',
				'editor.issues.galleyLocaleRequired'
			),

		);
	}

	/**
	 * Display the form.
	 * @param $request
	 * @return string
	 */
	function fetch($request, $template = null, $display = false)
	{
		$journal = $request->getJournal();
		$templateMgr = TemplateManager::getManager($request);

		$templateMgr->assign(array(
			'supportedLocales' => $journal->getSupportedSubmissionLocaleNames(),
			'submissionId' => $this->_submission->getId(),
			'stageId' => $request->getUserVar('stageId'),
			'fileStage' => $request->getUserVar('fileStage'),
			'submissionFileId' => $request->getUserVar('submissionFileId'),
			'publicationId' => $this->_publication->getId(),

		));

		return parent::fetch($request, $template, $display);
	}

	/**
	 * Assign form data to user-submitted data.
	 */
	function readInputData()
	{
		$this->readUserVars(
			array(
				'label',
				'galleyLocale',
				'submissionFileId',
				'fileStage'
			)
		);
	}

	/**
	 * Create article galley and dependent files
	 * @return ArticleGalley The resulting article galley.
	 */
	function execute(...$functionArgs)
	{
		$request = Application::get()->getRequest();
		$locale = AppLocale::getLocale();

		$sourceFile = Services::get('submissionFile')->get($this->getData('submissionFileId'));

		$submissionDir = Services::get('submissionFile')->getSubmissionDir($this->getSubmission()->getData('contextId'), $this->getSubmission()->getId());
		$files_dir = Config::getVar('files', 'files_dir') . DIRECTORY_SEPARATOR;
		$newFileId = Services::get('file')->add(
			$files_dir . $sourceFile->getData('path'),
			$files_dir . $submissionDir . DIRECTORY_SEPARATOR . uniqid() . '.xml'
		);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$newSubmissionFile = $submissionFileDao->newDataObject();

		$newSubmissionFile->setAllData(
			[
				'fileId' => $newFileId,
				'assocType' => $sourceFile->getData('assocType'),
				'assocId' => $sourceFile->getData('assocId'),
				'fileStage' => SUBMISSION_FILE_PROOF,
				'mimetype' => $sourceFile->getData('mimetype'),
				'locale' => $sourceFile->getData('locale'),
				'genreId' => $sourceFile->getData('genreId'),
				'name' => $sourceFile->getLocalizedData('name'),
				'submissionId' => $this->getSubmission()->getId()
			]
		);


		$newSubmissionFile = Services::get('submissionFile')->add($newSubmissionFile, $request);

		// Associate XML file into galley
		// Create  new galley
		$articleGalleyDao = DAORegistry::getDAO('ArticleGalleyDAO');
		$articleGalley = $articleGalleyDao->newDataObject();
		$articleGalley->setData('publicationId', $this->_publication->getId());
		$articleGalley->setLabel($this->getData('label'));
		$articleGalley->setLocale($this->getData('galleyLocale'));
		$articleGalley->setFileId($newSubmissionFile->getData('id'));

		Services::get('galley')->add($articleGalley, $request);


		// Get dependent files of the XML source file

		$dependentFiles = Services::get('submissionFile')->getMany([
			'assocTypes' => [ASSOC_TYPE_SUBMISSION_FILE],
			'assocIds' => [$sourceFile->getData('id')],
			'submissionIds' => [$this->getSubmission()->getId()],
			'fileStages' => [SUBMISSION_FILE_DEPENDENT],
			'includeDependentFiles' => true,
		]);


		foreach ($dependentFiles as $dependentFile) {

			$newDependentFileId = Services::get('file')->add(
				$files_dir . $dependentFile->getData('path'),
				$files_dir . $submissionDir . DIRECTORY_SEPARATOR . uniqid() . '.xml'
			);

			$newDependentFile = $submissionFileDao->newDataObject();

			$newDependentFile->setAllData(
				[
					'fileId' => $newDependentFileId,
					'assocType' => $dependentFile->getData('assocType'),
					'assocId' => $newSubmissionFile->getData('id'),
					'fileStage' => SUBMISSION_FILE_DEPENDENT,
					'mimetype' => $dependentFile->getData('mimetype'),
					'locale' => $dependentFile->getData('locale'),
					'genreId' => $dependentFile->getData('genreId'),
					'name' => $dependentFile->getLocalizedData('name'),
					'submissionId' => $this->getSubmission()->getId()
				]
			);

			Services::get('submissionFile')->add($newDependentFile, $request);

		}

		return $articleGalley;
	}

	function getSubmission()
	{
		return $this->_submission;
	}


}




