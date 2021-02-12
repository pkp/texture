<?php

/**
 * DAR archive format for texture libero editor
 * @class DAR
 *
 * @brief DAR Archive format
 */
class DAR {


	/**
	 * creates a DAR JSON file
	 *
	 * @param DAR $dar
	 * @param $request
	 * @param $submissionFile
	 * @return array
	 */
	public function construct(DAR $dar, $request, $submissionFile): array {

		$assets = array();
		$manuscript = Services::get('file')->fs->read($submissionFile->getData('path'));
		$manuscript = $dar->createManuscript($manuscript);

		$contents = $dar->createManifest($manuscript, $assets);
		$mediaInfos = $dar->createMediaInfo($request, $assets);


		$resources = array(
			DAR_MANIFEST_FILE => array(
				'encoding' => 'utf8',
				'data' => $contents,
				'size' => strlen($contents),
				'createdAt' => 0,
				'updatedAt' => 0,
			),
			DAR_MANUSCRIPT_FILE => array(
				'encoding' => 'utf8',
				'data' => $manuscript,
				'size' => strlen($manuscript),
				'createdAt' => 0,
				'updatedAt' => 0,
			),
		);
		$mediaBlob = array(
			'version' => 1,
			'resources' => array_merge($resources, $mediaInfos)
		);
		return $mediaBlob;
	}


	public function createManuscript($manuscript) {
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
		foreach ($manuscriptBody as $content){
			$node = $editableManuscriptDom->importNode($content, true);
			$editableManuscriptDom->documentElement->appendChild($node);
		}

		$refTypes = array("mixed-citation","element-citation");
		foreach ($refTypes as $ref) {
			foreach ($xpath->query("/article/back/ref-list/ref/" . $ref . "") as $content) {
				if (empty($content->getAttribute("publication-type"))) {
					$content->setAttribute('publication-type', 'journal');
				}
			}
		}
		$manuscriptBack = $xpath->query("/article/back");
		foreach ($manuscriptBack as $content){
			$node = $editableManuscriptDom->importNode($content, true);
			$editableManuscriptDom->documentElement->appendChild($node);
		}

		return $editableManuscriptDom->saveXML();
	}

	/**
	 * @param DOMDocument $dom
	 */
	protected function createEmptyMetadata(DOMDocument $dom): void {
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
	 * build DAR_MANIFEST_FILE from xml document
	 *
	 * @param $document string raw XML
	 * @param $assets array list of figure metadata
	 * @return mixed
	 */
	public function createManifest($manuscriptXml, &$assets) {

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
				$assets[] = array(
					'id' => $figId,
					'type' => 'image/jpg',
					'path' => $figGraphPath,
				);
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
	 * Build media info
	 *
	 * @param $request PKPRquest
	 * @param $assets array
	 * @return array
	 */
	public function createMediaInfo($request, $assets) {

		$infos = array();
		$router = $request->getRouter();
		$dispatcher = $router->getDispatcher();

		$submissionFileId = $request->getUserVar('submissionFileId');
		$stageId = $request->getUserVar('stageId');
		$submissionId = $request->getUserVar('submissionId');
		// build mapping to assets file paths

		$assetsFilePaths = $this->getDependentFilePaths($submissionId, $fileId);
		foreach ($assets as $asset) {
			$path = str_replace('media/', '', $asset['path']);
			if (array_key_exists($path, $assetsFilePaths)) {
				$filePath = $assetsFilePaths[$path];
				$url = $dispatcher->url($request, ROUTE_PAGE, null, 'texture', 'media', null, array(
					'submissionId' => $submissionId,
					'submissionFileId' => $fileId,
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
		}
		return $infos;
	}

	/**
	 * @param $submissionId
	 * @param $fileId
	 * @return array
	 */
	public function getDependentFilePaths($submissionId, $fileId): array {

		import('lib.pkp.classes.submission.SubmissionFile'); // Constants
		$dependentFiles = Services::get('submissionFile')->getMany([
			'assocTypes' => [ASSOC_TYPE_SUBMISSION_FILE],
			'assocIds' => [$fileId],
			'submissionIds' => [$submissionId],
			'fileStages' => [SUBMISSION_FILE_DEPENDENT],
			'includeDependentFiles' => true,
		]);

		$assetsFilePaths = array();
		foreach ($dependentFiles as $dFile) {
			$assetsFilePaths[$dFile->getOriginalFileName()] = $dFile->getFilePath();
		}
		return $assetsFilePaths;
	}

}
