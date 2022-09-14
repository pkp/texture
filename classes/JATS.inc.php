<?php


use DAORegistry;
use DOMDocument;
use DOMXpath;
use PKPString;

class JATS extends \DOMDocument
{

	public static function getJournalMeta(DOMDocument $origDocument, $context): void
	{

		$xpath = new DOMXpath($origDocument);

		$journalMeta = $xpath->query("//article/front/journal-meta");
		foreach ($journalMeta as $journalMetaEntry) {
			$origDocument->documentElement->removeChild($journalMetaEntry);
		}
		$articleMeta = $xpath->query("//article/front/article-meta");
		if (count($articleMeta) == 1) {
			if (count($journalMeta) == 0) {

				$journalMeta = $origDocument->createElement('journal-meta');

				$journalIdType = $origDocument->createElement('journal-id', $context->getLocalizedAcronym());
				$journalIdType->setAttribute('journal-id-type', 'publisher-id');
				$journalMeta->appendChild($journalIdType);
				$issn = $origDocument->createElement('issn', $context->getData('onlineIssn'));
				$issn->setAttribute('pub-type', 'epub');
				$journalMeta->appendChild($issn);
				$publisher = $origDocument->createElement('publisher');
				$publisherName = $origDocument->createElement('publisher-name', $context->getData('publisherInstitution'));
				$publisher->appendChild($publisherName);
				$journalMeta->appendChild($publisher);

				$articleMeta->item(0)->parentNode->insertBefore($journalMeta, $articleMeta->item(0));

			}

		}
	}


	public static function getArticleMetaHistory(DOMDocument $origDocument, Submission $submission, $datePublished = null): void
	{

		$xpath = new DOMXpath($origDocument);

		$editDecisionDao = DAORegistry::getDAO('EditDecisionDAO');
		$history = $xpath->query("//article/front/article-meta/history");

		foreach ($history as $item) {
			$item->parentNode->removeChild($item);
		}
		$history = $origDocument->createElement('history');
		$dateReceived = $submission->getData('dateSubmitted');
		if ($dateReceived) {
			$dateReceived = self::getDate($origDocument, $dateReceived, 'received');
			$history->appendChild($dateReceived);
		}

		$dateAccepted = null;
		$decisions = $editDecisionDao->getEditorDecisions($submission->getId());
		foreach ($decisions as $decision) {
			if ($decision['stageId'] == WORKFLOW_STAGE_ID_EXTERNAL_REVIEW && $decision['decision'] == SUBMISSION_EDITOR_DECISION_ACCEPT)
				$dateAccepted = $decision['dateDecided'];
		}
		if ($dateAccepted) {
			$history->appendChild(self::getDate($origDocument, $dateAccepted, 'accepted'));
		}

		if ($datePublished) {
			$history->appendChild(self::getDate($origDocument, $datePublished, 'published'));
		}


		$articleMeta = $xpath->query("//article/front/article-meta");
		if ($articleMeta)
			$articleMeta->item(0)->appendChild($history);


	}


	public static function getJournalMetaPubDate(DOMDocument $origDocument, $context, $submission, $datePublished,  $firstPage = null, $lastPage=null): void
	{
		$xpath = new DOMXpath($origDocument);
		$timestamp = strtotime($datePublished);

			$issueDao = DAORegistry::getDAO('IssueDAO');

		$pubDate = $xpath->query("//article/front/article-meta/pub-date");

		foreach ($pubDate as $item) {
			$item->parentNode->removeChild($item);
		}

		$pubDate = $origDocument->createElement('pub-date');
		$pubDate->setAttribute('pub-type','epub');
		$day = $origDocument->createElement('day', date('d', $timestamp));
		$pubDate->appendChild($day);
		$month = $origDocument->createElement('month', date('m', $timestamp));
		$pubDate->appendChild($month);
		$year = $origDocument->createElement('year', date('Y', $timestamp));
		$pubDate->appendChild($year);


		$issue = $issueDao->getBySubmissionId($submission->getId(), $context->getId());
		if($issue) {
			$volume = $origDocument->createElement('volume', $issue->getVolume());
			$pubDate->appendChild($volume);
		}

		if ($firstPage) {
			$pubDate->appendChild($origDocument->createElement('fpage',$firstPage));
		}
		if ($lastPage) {
			$pubDate->appendChild($origDocument->createElement('lpage',$lastPage));
		}
		$articleMeta = $xpath->query("//article/front/article-meta");
		if ($articleMeta)
			$articleMeta->item(0)->appendChild($pubDate);


	}


	public static function getArticleMetaCCBYLicense(DOMDocument $origDocument, $context, $copyrightYear = null): void
	{


		$xpath = new DOMXpath($origDocument);
		$permissions = $xpath->query("//article/front/article-meta/permissions");
		foreach ($permissions as $permission) {
			$origDocument->documentElement->removeChild($permission);
		}


		$articleMeta = $xpath->query("//article/front/article-meta");
		$licenseUrl = $context->getData('licenseUrl');
		if (count($articleMeta) > 0 and $licenseUrl) {


			PKPString::regexp_match_get('/http[s]?:(www\.)?\/\/creativecommons.org\/licenses\/([a-z]+(-[a-z]+)*)\/(\d.0)\/*([a-z]*).*/i', $licenseUrl, $matches);
			if (count($matches) > 5 and $matches[2] and $matches[4]) {

				if (!$$copyrightYear) $copyrightYear = date('Y');

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

	}

	public static function getDate(\DOMDocument $origDocument, string $dateAndTime, $type =null): DOMElement
	{
		$timestamp = strtotime($dateAndTime);
		$date = $origDocument->createElement('date');
		if ($type)	$date->setAttribute('type', $type);
		$date->setAttribute('iso-8601-date', date('Y-m-d', $timestamp));
		$day = $origDocument->createElement('day', date('d', $timestamp));
		$date->appendChild($day);
		$month = $origDocument->createElement('month', date('m', $timestamp));
		$date->appendChild($month);
		$year = $origDocument->createElement('year', date('Y', $timestamp));
		$date->appendChild($year);
		return $date;

	}
}
