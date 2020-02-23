<?php

/**
 * DAR archive format for texture libero editor
 * @class DAR
 *
 * @brief DAR Archive format
 */
class DAR {

	protected $UNSUPPORTED = array("/article/front/journal-meta", "/article/front/article-meta/self-uri");

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
		$filePath = $submissionFile->getFilePath();
		$manuscriptXml = file_get_contents($filePath);
		$manifestXml = $dar->createManifest($manuscriptXml, $assets);
		$manuscriptXml = $dar->removeElements($manuscriptXml, $this->UNSUPPORTED);
		$mediaInfos = $dar->createMediaInfo($request, $assets);

		$filesize = filesize($filePath);
		$resources = array(
			DAR_MANIFEST_FILE => array(
				'encoding' => 'utf8',
				'data' => $manifestXml,
				'size' => strlen($manifestXml),
				'createdAt' => 0,
				'updatedAt' => 0,
			),
			DAR_MANUSCRIPT_FILE => array(
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
		return $mediaBlob;
	}

	/**
	 * Removes unnecessary elements
	 *
	 * @param $manuscriptXml $manuscript
	 * @param $elementsArray array to remove
	 * @return DOMDocument
	 */
	public function removeElements($manuscriptXml, $elementsArray) {

		$manuscriptXmlDom = new DOMDocument;
		$manuscriptXmlDom->loadXML($manuscriptXml);
		$xpath = new DOMXpath($manuscriptXmlDom);

		foreach ($elementsArray as $elementPath) {
			$elements = $xpath->query($elementPath);
			foreach ($elements as $element) {
				$element->parentNode->removeChild($element);
			}
		}
		return $manuscriptXmlDom;
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

		$fileId = $request->getUserVar('fileId');
		$stageId = $request->getUserVar('stageId');
		$submissionId = $request->getUserVar('submissionId');
		// build mapping to assets file paths

		$assetsFilePaths = $this->getDependentFilePaths($submissionId, $fileId);
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
	 * @param $submissionId
	 * @param $fileId
	 * @return array
	 */
	public function getDependentFilePaths($submissionId, $fileId): array {

		$submissionFileDao = DAORegistry::getDAO('SubmissionFileDAO');
		import('lib.pkp.classes.submission.SubmissionFile'); // Constants
		$dependentFiles = $submissionFileDao->getLatestRevisionsByAssocId(
			ASSOC_TYPE_SUBMISSION_FILE,
			$fileId,
			$submissionId,
			SUBMISSION_FILE_DEPENDENT
		);
		$assetsFilePaths = array();
		foreach ($dependentFiles as $dFile) {
			$assetsFilePaths[$dFile->getOriginalFileName()] = $dFile->getFilePath();
		}
		return $assetsFilePaths;
	}

}
