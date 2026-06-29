<?php

/**
 * @file plugins/generic/texture/classes/XMLAmpersandEscaper.php
 *
 * Copyright (c) 2025 Simon Fraser University
 * Copyright (c) 2025 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class XMLAmpersandEscaper
 *
 * @ingroup plugins_generic_texture
 *
 * @brief XMLAmpersandEscaper
 */

namespace APP\plugins\generic\texture\classes;

use DOMDocument;

class XMLAmpersandEscaper
{
	private const UNESCAPED_AMPERSAND_PATTERN = '/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/';

	public static function escapeAmpersands(string $content): string
	{
		if (empty($content)) {
			return $content;
		}

		$result = preg_replace_callback(
			self::UNESCAPED_AMPERSAND_PATTERN,
			function ($matches) {
				return '&amp;';
			},
			$content
		);

		return $result;
	}

	public static function validateXmlAmpersands(string $content): bool
	{
		if (empty($content)) {
			return true;
		}

		$previousError = libxml_use_internal_errors(true);

		$dom = new DOMDocument();
		$success = $dom->loadXML($content);

		libxml_use_internal_errors($previousError);

		return $success;
	}

	public static function fixAndValidate(string $content): array
	{
		$originalValid = self::validateXmlAmpersands($content);

		if ($originalValid) {
			return [
				'content' => $content,
				'valid' => true,
				'original_valid' => true,
				'fixed' => false
			];
		}

		$fixedContent = self::escapeAmpersands($content);
		$fixedValid = self::validateXmlAmpersands($fixedContent);

		return [
			'content' => $fixedContent,
			'valid' => $fixedValid,
			'original_valid' => false,
			'fixed' => true
		];
	}
}
