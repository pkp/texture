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
		$context = $request->getJournal();
		$templateMgr = TemplateManager::getManager($request);

		$templateMgr->assign(array(
			'supportedLocales' => $context->getSupportedSubmissionLocaleNames(),
			'submissionId' => $this->_submission->getId(),
			'stageId' => $request->getUserVar('stageId'),
			'fileStage' => $request->getUserVar('fileStage'),
			'submissionFileId' => $request->getUserVar('submissionFileId'),
			'publicationId' => $this->_publication->getId(),
			'datePublished' => $this->_publication->getData('datePublished'),
			'publisherInstitution' => $context->getData('publisherInstitution'),
			'onlineIssn' => $context->getData('onlineIssn')

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
				'fileStage',
				'createJournalMeta',
				'createFpage',
				'createLpage',
				'datePublished',
				'onlineIssn',
				'publisherInstitution'
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
		$context = $request->getJournal();
		$sourceFile = Services::get('submissionFile')->get($this->getData('submissionFileId'));

		$submissionDir = Services::get('submissionFile')->getSubmissionDir($this->getSubmission()->getData('contextId'), $this->getSubmission()->getId());
		$files_dir = Config::getVar('files', 'files_dir') . DIRECTORY_SEPARATOR;


		$origDocument = new DOMDocument('1.0', 'utf-8');
		$sourceFileContent = Services::get('file')->fs->read($sourceFile->getData('path'));
		$origDocument->loadXML($sourceFileContent);

		$xpath = new DOMXpath($origDocument);

		# add license
		$permissions = $xpath->query("//article/front/article-meta/permissions");
		foreach ($permissions as $permission) {
			$origDocument->documentElement->removeChild($permission);
		}

		// add licnese
		$articleMeta = $xpath->query("//article/front/article-meta");
		$licenseUrl = $context->getData('licenseUrl');
		if (count($articleMeta) > 0 and $licenseUrl) {
			$copyrightYear = date('Y');
			switch ($context->getData('copyrightYearBasis')) {
				case 'submission':
					$copyrightYear = date('Y', strtotime($this->_publication->getData('datePublished')));
					break;
				case 'issue':
					if ($this->_publication->getData('issueId')) {
						$issueDao =& DAORegistry::getDAO('IssueDAO');
						$issue = $issueDao->getBySubmissionId($this->_submission->getId());
						if ($issue && $issue->getDatePublished()) {
							$copyrightYear = date('Y', strtotime($issue->getDatePublished()));
						}
					}
					break;
			}

			PKPString::regexp_match_get('/http[s]?:(www\.)?\/\/creativecommons.org\/licenses\/([a-z]+(-[a-z]+)*)\/(\d.0)\/*([a-z]*).*/i', $licenseUrl, $matches);
			if (count($matches) > 5 and $matches[2] and $matches[4]) {
				$permissionNode = $origDocument->createElement('permissions');
				$copyrightStatementNode = $origDocument->createElement('copyright-statement', '© ' . $copyrightYear . ' The Author(s)');
				$permissionNode->appendChild($copyrightStatementNode);
				$copyrightYearNode = $origDocument->createElement('copyright-year', $copyrightYear);
				$permissionNode->appendChild($copyrightYearNode);

				$copyrightLicenseNode = $origDocument->createElement('copyright-license');
				$copyrightLicenseNode->setAttribute('license-type', 'open-access');
				$copyrightLicenseNode->setAttribute('xlink:href', $licenseUrl);
				$copyrightLicenseNode->setAttribute('xml:lang', 'en');

				$copyrightLicensePNode = $origDocument->createElement('license-p');

				$inlineGraphicNode = $origDocument->createElement('inline-graphic');
				$inlineGraphicNode->setAttribute('xlink:href', 'https://mirrors.creativecommons.org/presskit/buttons/88x31/svg/' . $matches[2] . '.svg');
				$copyrightLicensePNode->appendChild($inlineGraphicNode);

				$countryCode = $matches[5] ? strtoupper($matches[5]) : '';
				$isoCodes = new \Sokil\IsoCodes\IsoCodesFactory();
				$country = $isoCodes->getCountries()->getByAlpha2($countryCode) ? $isoCodes->getCountries()->getByAlpha2($countryCode)->getName() : '';
				$licensePTextNode = $origDocument->createTextNode("This work is published under the Creative Commons  {$country} License {$matches[4]} (CC BY {$matches[4]} {$countryCode}).");

				$copyrightLicensePNode->appendChild($licensePTextNode);
				$copyrightLicenseNode->appendChild($copyrightLicensePNode);
				$permissionNode->appendChild($copyrightLicenseNode);
				$articleMeta[0]->appendChild($permissionNode);
			}
		}

		// add date

		// add journal meta
		$journalMeta = $xpath->query("//article/front/journal-meta");
		foreach ($journalMeta as $journalMetaEntry) {
			$origDocument->documentElement->removeChild($journalMetaEntry);
		}

		if ($this->getData('createJournalMeta') and count($journalMeta) > 0) {

			$journalMeta = $origDocument->createElement('journal-meta');

			$journalIdType = $origDocument->createElement('journal-id', $context->getLocalizedAcronym());
			$journalIdType->setAttribute('journal-id-type', 'publisher-id');
			$journalMeta->appendChild($journalIdType);
			$issn = new $origDocument->createElement('issn');
			$issn->setAttribute('pub-type', 'epub');

		}

		/***
		 * <journal-meta>
		 * <journal-id journal-id-type="publisher-id">XXX</journal-id>
		 * <issn pub-type="epub">XXX-XXX</issn>
		 * <publisher>
		 * <publisher-name>TIB Open Publishing</publisher-name>
		 * </publisher>
		 * </journal-meta>
		 */


		$tmpfname = tempnam(sys_get_temp_dir(), 'texture-update-xml');
		file_put_contents($tmpfname, $origDocument->saveXML());


		$newFileId = Services::get('file')->add(
			$tmpfname,
			$files_dir . $submissionDir . DIRECTORY_SEPARATOR . uniqid() . '.xml'
		);
		unlink($tmpfname);
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




