<?php

/**
 * @file plugins/generic/texture/TexturePlugin.php
 *
 * Copyright (c) 2003-2025 Simon Fraser University
 * Copyright (c) 2003-2025 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class TexturePlugin
 *
 * @ingroup plugins_generic_texture
 *
 * @brief Texture editor plugin
 */

namespace APP\plugins\generic\texture;

use APP\core\Application;
use APP\core\Request;
use APP\plugins\generic\texture\classes\handlers\TextureHandler;
use APP\template\TemplateManager;
use PKP\plugins\GenericPlugin;
use PKP\plugins\Hook;
use PKP\security\Role;

class TexturePlugin extends GenericPlugin
{
	public const PLUGIN_URL = 'texture';

	public const DAR_MANIFEST_FILE = 'manifest.xml';
	public const DAR_MANUSCRIPT_FILE = 'manuscript.xml';

	public const FILE_TYPE_DAR = 'dar';
	public const FILE_TYPE_ZIP = 'zip';
	public const FILE_TYPE_HTML = 'html';

	public const AUTHORIZED_ROLES = [
		Role::ROLE_ID_MANAGER,
		Role::ROLE_ID_SUB_EDITOR,
		Role::ROLE_ID_ASSISTANT,
		Role::ROLE_ID_REVIEWER,
		Role::ROLE_ID_AUTHOR
	];

	/**
	 * @copydoc Plugin::register()
	 */
	function register($category, $path, $mainContextId = null): bool
	{
		if (parent::register($category, $path, $mainContextId)) {
			if ($this->getEnabled()) {
				Hook::add('LoadHandler', $this->setPageHandler(...));

				$request = Application::get()->getRequest();
				$templateMgr = TemplateManager::getManager($request);

				$userRoleIds = array_map(fn($role) => $role->getId(),
						$request->getUser()?->getRoles($request->getContext()?->getId()) ?? []);
				if (!empty($userRoleIds) && !empty(array_intersect($userRoleIds, TexturePlugin::AUTHORIZED_ROLES))) {
					$this->addResources($templateMgr, $request);
				}
			}
			return true;
		}
		return false;
	}

	/**
	 * Callback load handler.
	 * @see PKPPageRouter::route()
	 */
	public function setPageHandler($hookName, $args): bool
	{
		$page =& $args[0];
		$handler =& $args[3];

		if ($this->getEnabled() && $page === self::PLUGIN_URL) {
			$handler = new TextureHandler($this);
			return true;
		}
		return false;
	}

	/**
	 * Add resources
	 */
	public function addResources(TemplateManager $templateMgr, Request $request): void
	{
		$templateMgr->addJavaScript(
			'TexturePluginJs',
			"{$request->getBaseUrl()}/{$this->getPluginPath()}/public/build/build.iife.js",
			[
				'inline' => false,
				'contexts' => ['backend'],
				'priority' => TemplateManager::STYLE_SEQUENCE_LAST
			]
		);
	}

	/**
	 * @copydoc Plugin::getDisplayName()
	 */
	public function getDisplayName(): string
	{
		return __('plugins.generic.texture.displayName');
	}

	/**
	 * @copydoc Plugin::getDescription()
	 */
	public function getDescription(): string
	{
		return __('plugins.generic.texture.description');
	}
}

// For backwards compatibility -- expect this to be removed approx. OJS/OMP/OPS 3.6
if (!PKP_STRICT_MODE) {
	class_alias('\APP\plugins\generic\texture\TexturePlugin', '\TexturePlugin');
}
