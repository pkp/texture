<?php

/**
 * @file plugins/generic/texture/classes/DAR.php
 *
 * Copyright (c) 2025 Simon Fraser University
 * Copyright (c) 2025 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class DAR
 *
 * @ingroup plugins_generic_texture
 *
 * @brief DAR Archive format
 */

namespace APP\plugins\generic\texture\classes;

use APP\core\Application;
use APP\core\Services;
use APP\facades\Repo;
use APP\plugins\generic\texture\TexturePlugin;
use DOMDocument;
use DOMImplementation;
use DOMXPath;
use PKP\submissionFile\SubmissionFile;

class DAR
{
	/**
	 * Creates a DAR JSON file.
	 */
	public function createDarJson(DAR $dar, $request, $submissionFile): array
	{
		$assets = [];
		$manuscript = Services::get('file')->fs->read($submissionFile->getData('path'));
		$manuscript = $dar->createManuscript($manuscript);

		$contents = $dar->createManifest($manuscript, $assets);
		$mediaInfos = $dar->createMediaInfo($request, $assets);

		$resources = [
			TexturePlugin::DAR_MANIFEST_FILE => [
				'encoding' => 'utf8',
				'data' => $contents,
				'size' => strlen($contents),
				'createdAt' => 0,
				'updatedAt' => 0
			],
			TexturePlugin::DAR_MANUSCRIPT_FILE => [
				'encoding' => 'utf8',
				'data' => $manuscript,
				'size' => strlen($manuscript),
				'createdAt' => 0,
				'updatedAt' => 0
			],
		];
		$mediaBlob = [
			'version' => 1,
			'resources' => array_merge($resources, $mediaInfos)
		];
		return $mediaBlob;
	}

	/**
	 * Create manuscript.
	 */
	public function createManuscript($manuscript): false|string
	{
		$domImpl = new DOMImplementation();
		$dtd = $domImpl->createDocumentType("article", "-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN", "JATS-archivearticle1.dtd");
		$editableManuscriptDom = $domImpl->createDocument("", "", $dtd);
		$editableManuscriptDom->encoding = 'UTF-8';

		$manuscriptXmlDom = new DOMDocument;
		$manuscriptXmlDom->loadXML($manuscript);

		$xpath = new DOMXpath($manuscriptXmlDom);

		$editableManuscriptDom->article = $editableManuscriptDom->createElement('article');
		foreach ($xpath->query('namespace::*', $manuscriptXmlDom->documentElement) as $node) {
			$nodeName = $node->nodeName;
			$nodeValue = $node->nodeValue;
			if ($nodeName !== "xmlns:xlink") {
				$editableManuscriptDom->article->setAttribute($nodeName, $nodeValue);
			}
		}
		$editableManuscriptDom->article->setAttributeNS(
			"http://www.w3.org/2000/xmlns/",
			"xmlns:xlink",
			"http://www.w3.org/1999/xlink"
		);
		$editableManuscriptDom->article->setAttribute("article-type", "research-article");

		$editableManuscriptDom->appendChild($editableManuscriptDom->article);

		$this->createEmptyMetadata($editableManuscriptDom);

		$manuscriptBody = $xpath->query("/article/body");
		foreach ($manuscriptBody as $content) {
			$node = $editableManuscriptDom->importNode($content, true);
			$editableManuscriptDom->documentElement->appendChild($node);
		}

		$refTypes = ["mixed-citation", "element-citation"];
		foreach ($refTypes as $ref) {
			foreach ($xpath->query("/article/back/ref-list/ref/" . $ref . "") as $content) {
				if (empty($content->getAttribute("publication-type"))) {
					$content->setAttribute('publication-type', 'journal');
				}
			}
		}
		$manuscriptBack = $xpath->query("/article/back");
		foreach ($manuscriptBack as $content) {
			$node = $editableManuscriptDom->importNode($content, true);
			$editableManuscriptDom->documentElement->appendChild($node);
		}

		return $editableManuscriptDom->saveXML();
	}

	/**
	 * Build TexturePlugin::DAR_MANIFEST_FILE from XML document.
	 */
	public function createManifest($manuscriptXml, &$assets)
	{
		$dom = new DOMDocument();
		if (!$dom->loadXML($manuscriptXml)) {
			exit("Unable to load XML document content in DOM in order to generate manifest XML.");
		}

		$k = 0;
		$assets = [];
		$figElements = $dom->getElementsByTagName('fig');
		foreach ($figElements as $figure) {
			$pos = $k + 1;
			$figItem = $figElements->item($k);
			$graphic = $figItem->getElementsByTagName('graphic');
			if (sizeof($graphic) > 0) {

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
				$assets[] = [
					'id' => $figId,
					'type' => 'image/jpg',
					'path' => $figGraphPath,
				];
			}
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
	 * Build media info.
	 */
	public function createMediaInfo($request, $assets): array
	{
		$infos = [];
		$router = $request->getRouter();
		$dispatcher = $router->getDispatcher();

		$submissionFileId = $request->getUserVar('submissionFileId');
		$stageId = $request->getUserVar('stageId');
		$submissionId = $request->getUserVar('submissionId');
		// build mapping to assets file paths

		$dependentFilesIterator = Repo::submissionFile()->getCollector()
			->filterByAssoc(Application::ASSOC_TYPE_SUBMISSION_FILE, [$submissionFileId])
			->filterBySubmissionIds([$submissionId])
			->filterByFileStages([SubmissionFile::SUBMISSION_FILE_DEPENDENT])
			->includeDependentFiles()
			->getMany();

		foreach ($dependentFilesIterator as $dependentFile) {
			$url = $dispatcher->url($request, Application::ROUTE_PAGE, null, 'texture', 'media', null,
				[
					'submissionId' => $submissionId,
					'stageId' => $stageId,
					'assocId' => $submissionFileId,
					'fileId' => $dependentFile->getData('fileId')
				]);

			$infos[$dependentFile->getLocalizedData('name')] = [
				'encoding' => 'url',
				'data' => $url
			];

		}

		return $infos;
	}

	/**
	 * Create empty metadata.
	 */
	protected function createEmptyMetadata(DOMDocument $dom): void
	{
		$dom->front = $dom->createElement('front');
		$dom->article->appendChild($dom->front);

		$dom->articleMeta = $dom->createElement('article-meta');
		$dom->front->appendChild($dom->articleMeta);

		$dom->titleGroup = $dom->createElement('title-group');
		$dom->articleTitle = $dom->createElement('article-title');

		$dom->titleGroup->appendChild($dom->articleTitle);
		$dom->articleMeta->appendChild($dom->titleGroup);

		$dom->abstract = $dom->createElement('abstract');
		$dom->articleMeta->appendChild($dom->abstract);
	}

	/**
	 * Get dependent file paths.
	 */
	public function getDependentFilePaths($submissionId, $fileId): array
	{
		$dependentFiles = Repo::submissionFile()->getCollector()
			->filterByAssoc(Application::ASSOC_TYPE_SUBMISSION_FILE, [$fileId])
			->filterBySubmissionIds([$submissionId])
			->filterByFileStages([SubmissionFile::SUBMISSION_FILE_DEPENDENT])
			->includeDependentFiles()
			->getMany();

		$assetsFilePaths = [];

		foreach ($dependentFiles as $dFile) {
			$assetsFilePaths[$dFile->getOriginalFileName()] = $dFile->getFilePath();
		}

		return $assetsFilePaths;
	}
}
