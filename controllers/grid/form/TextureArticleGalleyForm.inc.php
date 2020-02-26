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

class TextureArticleGalleyForm extends Form {
	/** @var the $_submission */
	var $_submission = null;


	/**
	 * Constructor.
	 * @param $request Request
	 * @param $plugin Plugin

	 * @param $submission Submission
	 */
	function __construct($request, $plugin, $submission) {
		$this->_submission = $submission;

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
			function ($galleyLocale) use ($journal) {
				return in_array($galleyLocale, $journal->getSupportedSubmissionLocaleNames());
			}
		);
	}

	/**
	 * Display the form.
	 * @param $request
	 * @return string
	 */
	function fetch($request) {
		$journal = $request->getJournal();
		$templateMgr = TemplateManager::getManager($request);

		$templateMgr->assign(array(
			'supportedLocales' => $journal->getSupportedSubmissionLocaleNames(),
			'submissionId' => $this->_submission->getId(),
			'stageId' => $request->getUserVar('stageId'),
			'fileStage' => $request->getUserVar('fileStage'),
			'fileId' => $request->getUserVar('fileId')

		));

		return parent::fetch($request);
	}

	/**
	 * Assign form data to user-submitted data.
	 */
	function readInputData() {
		$this->readUserVars(
			array(
				'label',
				'galleyLocale',
				'fileId',
				'fileStage'
			)
		);
	}

	/**
	 * Create article galley and dependent files
	 * @return ArticleGalley The resulting article galley.
	 */
	function execute() {

		$context = Application::getRequest()->getJournal();
		$submissionId = $this->_submission->getId();

		// Create  new galley
		$articleGalleyDao = DAORegistry::getDAO('ArticleGalleyDAO');
		$articleGalley = $articleGalleyDao->newDataObject();
		$articleGalley->setSubmissionId($this->_submission->getId());
		$articleGalley->setLabel($this->getData('label'));
		$articleGalley->setLocale($this->getData('galleyLocale'));
		$newGalleyId = $articleGalleyDao->insertObject($articleGalley);

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		$fileStage = $this->getData('fileStage');
		$submissionFile = $submissionFileDao->getLatestRevision( $this->getData('fileId'), $fileStage, $submissionId);

		// Create galley XML file from the production XML  source file
		import('lib.pkp.classes.file.SubmissionFileManager');
		$submissionFileManager = new SubmissionFileManager($context->getId(), $submissionFile);
		$fileId = $submissionFile->getFileId();
		$revision = $submissionFile->getRevision();


		list($newFileId, $newRevision) = $submissionFileManager->copyFileToFileStage($fileId, $revision, $fileStage, null, true);
		$newSubmissionFile = $submissionFileDao->getLatestRevision($newFileId, $fileStage, $submissionId);
		$newSubmissionFile->setAssocType(ASSOC_TYPE_REPRESENTATION);
		$newSubmissionFile->setAssocId($newGalleyId);
		$newSubmissionFile->setFileStage(SUBMISSION_FILE_PROOF);
		$newSubmissionFile->setGenreId(GENRE_CATEGORY_DOCUMENT);

		$submissionFileDao->updateObject($newSubmissionFile);

		// Associate XML file into galley
		if ($articleGalley) {
			$articleGalley->setFileId($newSubmissionFile->getFileId());
			$articleGalleyDao->updateObject($articleGalley);
		}

		// Get dependent files of the XML source file
		$dependentFiles = $submissionFileDao->getLatestRevisionsByAssocId(
			ASSOC_TYPE_SUBMISSION_FILE,
			$submissionFile->getFileId(),
			$submissionFile->getSubmissionId(),
			SUBMISSION_FILE_DEPENDENT
		);

		// Copy dependent files to the galley XML file
		foreach ($dependentFiles as $dependentFile) {
			$dependentFileId = $dependentFile->getFileId();
			$dependentFileRevision = $dependentFile->getRevision();
			$dependentFileStage = $dependentFile->getFileStage();

			list($newDependentFileId, $newDependentFileRevision) = $submissionFileManager->copyFileToFileStage($dependentFileId, $dependentFileRevision, $dependentFileStage, null, true);
			$newDependentFile = $submissionFileDao->getLatestRevision($newDependentFileId, SUBMISSION_FILE_DEPENDENT, $submissionId);
			$newDependentFile->setAssocId($newFileId);
			$submissionFileDao->updateObject($newDependentFile);
		}

		return $articleGalley;
	}


}




