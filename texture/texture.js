(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('substance'), require('katex')) :
  typeof define === 'function' && define.amd ? define(['exports', 'substance', 'katex'], factory) :
  (global = global || self, factory(global.texture = {}, global.substance, global.katex));
}(this, function (exports, substance, katex) { 'use strict';

  var substance__default = 'default' in substance ? substance['default'] : substance;
  katex = katex && katex.hasOwnProperty('default') ? katex['default'] : katex;

  // Legacy

  // This is only used for Value models
  function addModelObserver (model, fn, comp, options = {}) {
    let stage = options.stage || 'render';
    if (model._isValue) {
      let path = model.getPath();
      comp.context.editorState.addObserver(['document'], fn, comp, {
        stage,
        document: { path }
      });
    }
  }

  /* istanbul ignore file */

  function throwMethodIsAbstract () {
    throw new Error('This method is abstract.')
  }

  class ValueModel {
    constructor (api, path) {
      this._api = api;
      this._path = path;
    }

    get id () {
      return substance.getKeyForPath(this._path)
    }

    get type () {
      throwMethodIsAbstract();
    }

    getPath () {
      return this._path
    }

    // EXPERIMENTAL: a third kind of path, which is [<type>, <prop-name>]
    _getPropertySelector () {
      if (!this._selector) {
        let doc = this._api.getDocument();
        let node = doc.get(this._path[0]);
        this._selector = [node.type].concat(this._path.slice(1));
      }
      return this._selector
    }

    hasTargetType (name) {
      return false
    }

    getValue () {
      return this._api.getDocument().get(this._path)
    }

    setValue (val) {
      // TODO this should go into API
      let api = this._api;
      api.getEditorSession().transaction(tx => {
        tx.set(this._path, val);
        tx.setSelection(api._createValueSelection(this._path));
      });
    }

    getSchema () {
      return this._api.getDocument().getProperty(this._path)
    }

    isEmpty () {
      return substance.isNil(this.getValue())
    }

    _resolveId (id) {
      return this._api.getDocument().get(id)
    }

    get _value () { return this.getValue() }

    get _isValue () { return true }
  }

  class BooleanModel extends ValueModel {
    get type () { return 'boolean' }

    // Note: Nil is interpreted as false, and false is thus also interpreted as isEmpty()
    isEmpty () {
      return !this.getValue()
    }
  }

  class ChildModel extends ValueModel {
    constructor (api, path, targetTypes) {
      super(api, path);

      this._targetTypes = targetTypes;
    }

    get type () { return 'child' }

    getChild () {
      return this._resolveId(this.getValue())
    }

    hasTargetType (type) {
      return this._targetTypes.has(type)
    }

    isEmpty () {
      // FIXME: formerly we have delegated to a child model (but, when is a node / composite model empty?)
      let child = this.getChild();
      return !child
    }
  }

  function isCollectionEmpty (api, path) {
    let doc = api.getDocument();
    let ids = doc.get(path);
    if (ids.length === 0) return true
    // otherwise considered only empty if container has only one empty child node
    if (ids > 1) return false
    let first = doc.get(ids[0]);
    // being robust against invalid ids
    if (first && first.isEmpty) {
      return first.isEmpty()
    }
  }

  class CollectionModel extends ValueModel {
    constructor (api, path, targetTypes) {
      super(api, path);

      this._targetTypes = targetTypes;
    }

    get type () { return 'collection' }

    get isCollection () {
      return true
    }

    getItems () {
      const doc = this._api.getDocument();
      return substance.documentHelpers.getNodesForIds(doc, this.getValue())
    }

    addItem (item) {
      // TODO: instead of requiring a bunch of low-level API
      // methods we should instead introduce a Collection API
      // where these low-level things are implemented
      // TODO: things brings me then to the point, questioning
      // the benefit of a general CollectionModel. Probably this
      // should be moved into Article API land.
      this._api._appendChild(this._path, item);
    }

    removeItem (item) {
      this._api._removeChild(this._path, item.id);
    }

    get length () { return this.getValue().length }

    getValue () {
      return super.getValue() || []
    }

    isEmpty () {
      return isCollectionEmpty(this._api, this._path)
    }

    hasTargetType (type) {
      return this._targetTypes.has(type)
    }
  }

  class EnumModel extends ValueModel {
    get type () { return 'enum' }
  }

  // TODO: this does not seem to be the right approach
  // We have taken this too far, i.e. trying to generate an editor
  // for reference properties without ownership (aka relationships)
  class _RelationshipModel extends ValueModel {
    constructor (api, path, targetTypes) {
      super(api, path);

      this._targetTypes = targetTypes;
    }

    hasTargetType (type) {
      return this._targetTypes.has(type)
    }

    getAvailableOptions () {
      return this._api._getAvailableOptions(this)
    }
  }

  class ManyRelationshipModel extends _RelationshipModel {
    get type () { return 'many-relationship' }

    getValue () {
      return super.getValue() || []
    }

    isEmpty () {
      return this.getValue().length === 0
    }

    toggleTarget (target) {
      this._api._toggleRelationship(this._path, target.id);
    }
  }

  class NumberModel extends ValueModel {
    get type () { return 'number' }
  }

  class ObjectModel extends ValueModel {
    get type () { return 'object' }
  }

  class SingleRelationshipModel extends _RelationshipModel {
    get type () { return 'single-relationship' }

    toggleTarget (target) {
      let currentTargetId = this.getValue();
      let newTargetId;
      if (currentTargetId === target.id) {
        newTargetId = undefined;
      } else {
        newTargetId = target.id;
      }
      this._api.getEditorSession().transaction(tx => {
        let path = this._path;
        tx.set(path, newTargetId);
        tx.setSelection(this._api._createValueSelection(path));
      });
    }
  }

  class StringModel extends ValueModel {
    get type () { return 'string' }

    isEmpty () {
      let value = this.getValue();
      return substance.isNil(value) || value.length === 0
    }
  }

  class TextModel extends StringModel {
    get type () { return 'text' }
  }

  function createValueModel (api, path, property) {
    let doc = api.getDocument();
    if (!property) property = doc.getProperty(path);
    let targetTypes = property.targetTypes;
    let valueModel;
    switch (property.type) {
      case 'boolean': {
        valueModel = new BooleanModel(api, path);
        break
      }
      case 'enum': {
        valueModel = new EnumModel(api, path);
        break
      }
      case 'number': {
        valueModel = new NumberModel(api, path);
        break
      }
      case 'string': {
        valueModel = new StringModel(api, path);
        break
      }
      case 'text': {
        valueModel = new TextModel(api, path);
        break
      }
      case 'object': {
        valueModel = new ObjectModel(api, path);
        break
      }
      default: {
        if (property.isReference()) {
          if (property.isOwned()) {
            if (property.isArray()) {
              valueModel = new CollectionModel(api, path, targetTypes);
            } else {
              valueModel = new ChildModel(api, path, targetTypes);
            }
          } else {
            if (property.isArray()) {
              valueModel = new ManyRelationshipModel(api, path, targetTypes);
            } else {
              valueModel = new SingleRelationshipModel(api, path, targetTypes);
            }
          }
        } else {
          valueModel = new ValueModel(api, path);
        }
      }
    }

    return valueModel
  }

  function createNodePropertyModels (api, node, hooks = {}) {
    let properties = new Map();
    for (let p of node.getSchema()) {
      if (p.name === 'id') continue
      if (p.name === 'type') continue
      // EXPERIMENTAL: allowing to override creation of a property model
      // for the purpose of flattening....
      // TODO: this could also be done via option

      let hook = substance.isFunction(hooks) ? hooks : hooks[p.name];

      if (hook) {
        let val = hook(p);
        // allow to skip properties by returning nil
        if (substance.isNil(val)) continue

        if (val instanceof Map) {
          for (let [name, model] of val) {
            properties.set(name, model);
          }
        } else if (val._isValue) {
          properties.set(p.name, val);
        } else {
          // expecting either a single ValueModel, or a Map(name->ValueModel)
          throw new Error('Illegal value')
        }
      } else {
        let valueModel = createValueModel(api, [node.id, p.name], p);
        properties.set(p.name, valueModel);
      }
    }
    return properties
  }

  function removeModelObserver (comp) {
    comp.context.editorState.removeObserver(comp);
  }

  class AbstractScrollPane extends substance.Component {
    getActionHandlers () {
      return {
        'scrollSelectionIntoView': this._scrollSelectionIntoView
      }
    }
    /*
      Expose scrollPane as a child context
    */
    getChildContext () {
      return {
        scrollPane: this
      }
    }

    getName () {
      return this.props.name
    }

    /*
      Determine mouse bounds relative to content element
      and emit context-menu:opened event with positioning hints
    */
    _onContextMenu (e) {
      e.preventDefault();
      let mouseBounds = this._getMouseBounds(e);
      this.emit('context-menu:opened', {
        mouseBounds: mouseBounds
      });
    }

    _scrollRectIntoView (rect) {
      if (!rect) return
      // console.log('AbstractScrollPane._scrollRectIntoView()')
      let upperBound = this.getScrollPosition();
      let lowerBound = upperBound + this.getHeight();
      let selTop = rect.top;
      let selBottom = rect.top + rect.height;
      if ((selTop < upperBound && selBottom < upperBound) ||
          (selTop > lowerBound && selBottom > lowerBound)) {
        this.setScrollPosition(selTop);
      }
    }

    _scrollSelectionIntoView () {
      this._scrollRectIntoView(this._getSelectionRect());
    }

    /**
      Returns the height of scrollPane (inner content overflows)
    */
    getHeight () {
      throw new Error('Abstract method')
    }

    /**
      Returns the cumulated height of a panel's content
    */
    getContentHeight () {
      throw new Error('Abstract method')
    }

    getContentElement () {
      // TODO: should be wrapped in DefaultDOMElement
      throw new Error('Abstract method')
    }

    /**
      Get the `.se-scrollable` element
    */
    getScrollableElement () {
      throw new Error('Abstract method')
    }

    /**
      Get current scroll position (scrollTop) of `.se-scrollable` element
    */
    getScrollPosition () {
      throw new Error('Abstract method')
    }

    setScrollPosition () {
      throw new Error('Abstract method')
    }

    /**
      Get offset relative to `.se-content`.

      @param {DOMNode} el DOM node that lives inside the
    */
    getPanelOffsetForElement(el) { // eslint-disable-line
      throw new Error('Abstract method')
    }

    /**
      Scroll to a given sub component.

      @param {String} componentId component id, must be present in data-id attribute
    */
    scrollTo(componentId, onlyIfNotVisible) { // eslint-disable-line
      throw new Error('Abstract method')
    }

    _getContentRect () {
      return this.getContentElement().getNativeElement().getBoundingClientRect()
    }

    /*
      Get selection rectangle relative to panel content element
    */
    _getSelectionRect () {
      let appState = this.context.editorState;
      let sel = appState.selection;
      let selectionRect;
      if (substance.platform.inBrowser && sel && !sel.isNull()) {
        let contentEl = this.getContentElement();
        let contentRect = contentEl.getNativeElement().getBoundingClientRect();
        if (sel.isNodeSelection()) {
          let nodeId = sel.nodeId;
          let nodeEl = contentEl.find(`*[data-id="${nodeId}"]`);
          if (nodeEl) {
            let nodeRect = nodeEl.getNativeElement().getBoundingClientRect();
            selectionRect = substance.getRelativeRect(contentRect, nodeRect);
          } else {
            console.error(`FIXME: could not find a node with data-id=${nodeId}`);
          }
        } else {
          selectionRect = substance.getSelectionRect(contentRect);
        }
      }
      return selectionRect
    }

    _getMouseBounds (e) {
      return substance.getRelativeMouseBounds(e, this.getContentElement().getNativeElement())
    }
  }

  class BodyScrollPane extends AbstractScrollPane {
    /*
      Expose scrollPane as a child context
    */
    getChildContext () {
      return {
        scrollPane: this
      }
    }

    getName () {
      return 'body'
    }

    render ($$) {
      let el = $$('div');
      if (this.props.contextMenu === 'custom') {
        el.on('contextmenu', this._onContextMenu);
      }
      el.append(this.props.children);
      return el
    }

    /**
      Returns the height of scrollPane (inner content overflows)
    */
    getHeight () {
      if (substance.platform.inBrowser) {
        return window.innerHeight
      } else {
        return 0
      }
    }

    /**
      Returns the cumulated height of a panel's content
    */
    getContentHeight () {
      if (substance.platform.inBrowser) {
        return document.body.scrollHeight
      } else {
        return 0
      }
    }

    getContentElement () {
      if (substance.platform.inBrowser) {
        return substance.DefaultDOMElement.wrapNativeElement(window.document.body)
      } else {
        return null
      }
    }

    // /**
    //   Get the `.se-scrollable` element
    // */
    getScrollableElement () {
      if (substance.platform.inBrowser) {
        return document.body
      } else {
        return null
      }
    }

    /**
      Get current scroll position (scrollTop) of `.se-scrollable` element
    */
    getScrollPosition () {
      if (substance.platform.inBrowser) {
        return document.body.scrollTop
      } else {
        return 0
      }
    }

    setScrollPosition (scrollPos) {
      if (substance.platform.inBrowser) {
        document.body.scrollTop = scrollPos;
      }
    }

    /**
      Get offset relative to `.se-content`.

      @param {DOMNode} el DOM node that lives inside the
    */
    getPanelOffsetForElement(el) { // eslint-disable-line
      console.warn('TODO: implement');
    }

    /**
      Scroll to a given sub component.

      @param {String} componentId component id, must be present in data-id attribute
    */
    scrollTo(componentId, onlyIfNotVisible) { // eslint-disable-line
      console.warn('TODO: implement');
    }
  }

  class ValueComponent extends substance.Component {
    didMount () {
      const appState = this.context.editorState;
      const path = this._getPath();
      appState.addObserver(['document'], this._rerenderOnModelChange, this, {
        stage: 'render',
        document: { path }
      });
    }

    dispose () {
      const appState = this.context.editorState;
      appState.removeObserver(this);
    }

    // EXPERIMENTAL:
    // trying to avoid unnecessary rerenderings
    shouldRerender (newProps) {
      return newProps.model !== this.props.model
    }

    _rerenderOnModelChange () {
      // console.log('Rerendering ValueComponent after model update:', this._getPath())
      this.rerender();
    }

    _getPath () {
      return this.props.model._path
    }
  }

  class CheckboxInput extends substance.Component {
    render ($$) {
      const isChecked = Boolean(this.props.value);
      const icon = isChecked ? 'fa-check-square-o' : 'fa-square-o';
      let el = $$('div').addClass('sc-checkbox')
        .on('click', this._onClick);
      el.append(
        // TODO: use icon provider
        $$(substance.FontAwesomeIcon, { icon: icon }).addClass('se-icon')
      );
      return el
    }

    _onClick (e) {
      e.preventDefault();
      e.stopPropagation();
      this.send('toggleValue');
    }
  }

  class BooleanComponent extends ValueComponent {
    getActionHandlers () {
      return {
        toggleValue: this._toggleValue
      }
    }

    render ($$) {
      const model = this.props.model;
      const value = model.getValue();
      let el = $$('div').addClass('sc-boolean');
      if (!this.context.editable) {
        el.addclass('sm-readonly');
      }
      el.append(
        $$(CheckboxInput, { value })
      );
      return el
    }

    _toggleValue () {
      if (this.context.editable) {
        const model = this.props.model;
        this.props.model.setValue(!model.getValue());
      }
    }
  }

  class Button extends substance.Component {
    render ($$) {
      let el = $$('button')
        .addClass('sc-button');

      if (this.props.icon) {
        el.append(this.renderIcon($$));
      }
      if (this.props.label) {
        el.append(this.renderLabel($$));
      }
      if (this.props.tooltip) {
        el.attr('title', this.props.tooltip);
      }
      if (this.props.dropdown) {
        el.append(this.renderDropdownIcon($$));
      }
      if (this.props.active) {
        el.addClass('sm-active');
      }
      if (this.props.theme) {
        el.addClass('sm-theme-' + this.props.theme);
      }

      if (this.props.disabled) {
        // make button inaccessible
        el.attr('tabindex', -1)
          .attr('disabled', true);
      } else {
        // make button accessible for tab-navigation
        el.attr('tabindex', 1);
      }

      // Ability to inject additional elements (should be avoided!)
      el.append(this.props.children);
      return el
    }

    renderIcon ($$) {
      let iconEl = this.context.iconProvider.renderIcon($$, this.props.icon);
      return iconEl
    }

    renderDropdownIcon ($$) {
      let iconEl = this.context.iconProvider.renderIcon($$, 'dropdown');
      iconEl.addClass('se-dropdown');
      return iconEl
    }

    renderLabel ($$) {
      return $$('span').addClass('se-label').append(
        this.getLabel(this.props.label)
      )
    }

    getLabel (name) {
      let labelProvider = this.context.labelProvider;
      return labelProvider.getLabel(name, this.props.commandState)
    }
  }

  function getComponentForModel (context, model) {
    let componentRegistry = context.componentRegistry;
    let ComponentClass = componentRegistry.get(model.type);
    if (!ComponentClass) {
      throw new Error(`No Component class registered for model type ${model.type}.`)
    }
    return ComponentClass
  }

  class ChildComponent extends ValueComponent {
    render ($$) {
      const child = this.props.model.getChild();
      let ComponentClass = getComponentForModel(this.context, child);
      let props = Object.assign({}, this.props);
      props.node = child;
      delete props.model;
      return $$(ComponentClass, props)
    }
  }

  function ModifiedSurface (Surface) {
    class _ModifiedSurface extends Surface {
      constructor (parent, props, options) {
        super(parent, _monkeyPatchSurfaceProps(parent, props), options);
      }

      setProps (newProps) {
        return super.setProps(_monkeyPatchSurfaceProps(this.parent, newProps))
      }
    }
    return _ModifiedSurface
  }

  function _monkeyPatchSurfaceProps (parent, props) {
    let newProps = Object.assign({}, props);
    if (props.model && !props.node) {
      const model = props.model;
      switch (model.type) {
        case 'collection': {
          newProps.containerPath = model._path;
          break
        }
        default: {
          // TODO: do we really need this anymore?
          if (model._node) {
            newProps.node = model._node;
          }
        }
      }
    }
    return newProps
  }

  class ContainerEditorNew extends ModifiedSurface(substance.ContainerEditor) {
    // overriding default to allow insertion of 'break' nodes instead of '\n'
    _softBreak () {
      let editorSession = this.getEditorSession();
      let sel = editorSession.getSelection();
      if (sel.isPropertySelection()) {
        // find out if the current node allows for <break>
        let doc = editorSession.getDocument();
        let prop = doc.getProperty(sel.start.path);
        if (prop.targetTypes && prop.targetTypes.has('break')) {
          editorSession.transaction(tx => {
            let br = tx.create({ type: 'break' });
            tx.insertInlineNode(br);
          }, { action: 'soft-break' });
        } else {
          editorSession.transaction(tx => {
            tx.insertText('\n');
          }, { action: 'soft-break' });
        }
      } else {
        editorSession.transaction((tx) => {
          tx.break();
        }, { action: 'break' });
      }
    }
  }

  function getComponentForNode (comp, node) {
    let componentRegistry = comp.context.componentRegistry;
    let ComponentClass = componentRegistry.get(node.type);
    if (!ComponentClass) {
      let superTypes = node.getSchema().getSuperTypes();
      for (let superType of superTypes) {
        ComponentClass = componentRegistry.get(superType);
        if (ComponentClass) break
      }
    }
    if (!ComponentClass) {
      throw new Error(`No Component class registered for model type ${node.type}.`)
    }
    return ComponentClass
  }

  function renderNode ($$, comp, node, props = {}) {
    let NodeComponent = getComponentForNode(comp, node);
    props = Object.assign({
      disabled: comp.props.disabled,
      node
    }, props);
    return $$(NodeComponent, props)
  }

  /**
   * A component that renders a CHILDREN value.
   *
   * Note: I decided to use the name Collection here as from the application point of view a CHILDREN field is a collection.
   */
  class CollectionComponent extends substance.Component {
    render ($$) {
      const props = this.props;
      const model = props.model;
      let renderAsContainer;
      if (props.hasOwnProperty('container')) {
        renderAsContainer = Boolean(props.container);
      } else {
        renderAsContainer = model.getSchema().isContainer();
      }
      if (renderAsContainer) {
        return $$(EditableCollection, Object.assign({}, props, {
          containerPath: props.model.getPath()
        }))
      } else {
        return $$(ReadOnlyCollection, props)
      }
    }
  }

  class ReadOnlyCollection extends ValueComponent {
    // NOTE: this is less efficient than ContainerEditor as it will always render the whole collection
    render ($$) {
      let props = this.props;
      let model = props.model;
      let el = $$('div').addClass('sc-collection').attr('data-id', substance.getKeyForPath(model.getPath()));
      let items = model.getItems();
      el.append(
        items.map(item => renderNode($$, this, item, { disabled: props.disabled }).ref(item.id))
      );
      return el
    }
  }

  class EditableCollection extends ContainerEditorNew {
    _getClassNames () {
      return 'sc-collection sc-container-editor sc-surface'
    }
  }

  const DISABLED = { disabled: true };

  /**
   * A component that renders a group of tools.
   *
   * @param {string} props.name
   * @param {string} props.style
   * @param {string} props.theme
   * @param {boolean} props.hideDisabled
   * @param {array} props.items array of item specifications
   * @param {object} props.commandStates command states by name
   */
  class ToolGroup extends substance.Component {
    constructor (...args) {
      super(...args);

      this._deriveState(this.props);
    }

    willReceiveProps (newProps) {
      this._deriveState(newProps);
    }

    getTheme () {
      // HACK: falling back to 'light' in a hard-coded way
      return this.props.theme || 'light'
    }

    _deriveState (props) {
      if (this._isTopLevel) {
        this._derivedState = this._deriveGroupState(props, props.commandStates);
      } else {
        this._derivedState = props.itemState;
      }
    }

    render ($$) {
      const { name, hideDisabled } = this.props;
      let el = $$('div')
        .addClass(this._getClassNames())
        .addClass('sm-' + name);

      let hasEnabledItem = this._derivedState.hasEnabledItem;
      if (hasEnabledItem || !hideDisabled) {
        el.append(this._renderLabel($$));
        el.append(this._renderItems($$));
      }

      return el
    }

    _renderLabel ($$) {
      const { style, label } = this.props;
      if (style === 'descriptive' && label) {
        const SeparatorClass = this.getComponent('tool-separator');
        return $$(SeparatorClass, { label })
      }
    }

    _renderItems ($$) {
      const { style, hideDisabled, commandStates } = this.props;
      const theme = this.getTheme();
      const { itemStates } = this._derivedState;
      let els = [];
      for (let itemState of itemStates) {
        let item = itemState.item;
        let type = item.type;
        switch (type) {
          case 'command': {
            const commandName = item.name;
            let commandState = itemState.commandState;
            if (itemState.enabled || !hideDisabled) {
              let ToolClass = this._getToolClass(item);
              els.push(
                $$(ToolClass, {
                  item,
                  commandState,
                  style,
                  theme
                }).ref(commandName)
              );
            }
            break
          }
          case 'separator': {
            let ToolSeparator = this.getComponent('tool-separator');
            els.push(
              $$(ToolSeparator, item)
            );
            break
          }
          default: {
            if (!hideDisabled || itemState.enabled || itemState.hasEnabledItem) {
              let ToolClass = this._getToolClass(item);
              els.push(
                // ATTENTION: we are passing down options present on the current
                // group, but they can be overridden via spec
                // TODO: add all con
                $$(ToolClass, Object.assign({ hideDisabled, style }, item, {
                  commandStates,
                  itemState,
                  theme
                })).ref(item.name)
              );
            }
          }
        }
      }
      return els
    }

    get _isTopLevel () { return false }

    // ATTENTION: this is only called for top-level tool groups (Menu, Prompt, ) which are ToolDrop
    _deriveGroupState (group, commandStates) {
      let itemStates = group.items.map(item => this._deriveItemState(item, commandStates));
      let hasEnabledItem = itemStates.some(item => item.enabled || item.hasEnabledItem);
      return {
        item: group,
        itemStates,
        hasEnabledItem
      }
    }

    _deriveItemState (item, commandStates) {
      switch (item.type) {
        case 'command': {
          let commandState = commandStates[item.name] || DISABLED;
          return {
            item,
            commandState,
            enabled: !commandState.disabled
          }
        }
        case 'group':
        case 'dropdown':
        case 'prompt':
        case 'switcher': {
          return this._deriveGroupState(item, commandStates)
        }
        case 'custom':
        case 'separator':
        case 'spacer': {
          return { item }
        }
        default:
          throw new Error('Unsupported item type')
      }
    }

    _getClassNames () {
      return 'sc-tool-group'
    }

    _getToolClass (item) {
      // use an ToolClass from toolSpec if configured inline in ToolGroup spec
      let ToolClass;
      if (item.ToolClass) {
        ToolClass = item.ToolClass;
      } else {
        switch (item.type) {
          case 'command': {
            // try to use a tool registered by the same name as the command
            ToolClass = this.getComponent(item.name, 'no-throw');
            if (!ToolClass) {
              // using the default tool otherwise
              ToolClass = this.getComponent('tool');
            }
            break
          }
          case 'dropdown': {
            ToolClass = this.getComponent('tool-dropdown');
            break
          }
          case 'group': {
            ToolClass = this.getComponent('tool-group');
            break
          }
          case 'separator': {
            ToolClass = this.getComponent('tool-separator');
            break
          }
          case 'spacer': {
            ToolClass = this.getComponent('tool-spacer');
            break
          }
          default: {
            console.error('Unsupported item type inside ToolGroup:', item.type);
          }
        }
      }

      return ToolClass
    }
  }

  class ToolPanel extends ToolGroup {
    get _isTopLevel () { return true }
  }

  // TODO: refactor this. I don't like how this is tight to ScrollPane
  class ContextMenu extends ToolPanel {
    didMount () {
      super.didMount();
      if (!this.context.scrollPane) {
        throw new Error('Requires a scrollPane context')
      }
      this.context.scrollPane.on('context-menu:opened', this._onContextMenuOpened, this);
    }

    dispose () {
      super.dispose();
      this.context.scrollPane.off(this);
    }

    render ($$) {
      let el = $$('div')
        .addClass(this._getClassNames())
        .addClass('sm-hidden')
        .addClass('sm-theme-' + this.getTheme());
      el.append(
        $$('div').addClass('se-active-tools').append(
          this._renderItems($$)
        ).ref('entriesContainer')
      );
      return el
    }

    _getClassNames () {
      return 'sc-context-menu'
    }

    /*
      Positions the content menu relative to the scrollPane
    */
    _onContextMenuOpened (hints) {
      // ATTENTION: assuming that the context menu is always only showing enabled tools
      if (this._derivedState.hasEnabledItem) {
        let mouseBounds = hints.mouseBounds;
        this.el.removeClass('sm-hidden');
        let contextMenuWidth = this.el.htmlProp('offsetWidth');

        // By default, context menu are aligned left bottom to the mouse coordinate clicked
        this.el.css('top', mouseBounds.top);
        let leftPos = mouseBounds.left;
        // Must not exceed left bound
        leftPos = Math.max(leftPos, 0);
        // Must not exceed right bound
        let maxLeftPos = mouseBounds.left + mouseBounds.right - contextMenuWidth;
        leftPos = Math.min(leftPos, maxLeftPos);
        this.el.css('left', leftPos);
      }
    }
  }

  /*
    This is an eperimental wrap component for rendering a section in dialogs
    with label and description on top of content.
    Example:
    ```
      $$(DialogSectionComponent, {label: 'Enter DOI', description: 'use a comma to separate values'})
        .append($$(DOIInput))
    ```
  */
  class DialogSectionComponent extends substance.Component {
    render ($$) {
      const label = this.props.label;
      const description = this.props.description;
      const children = this.props.children;

      const el = $$('div').addClass('sc-dialog-section');

      if (label) {
        const sectionTitleEl = $$('div').addClass('se-dialog-section-title').append(
          $$('div').addClass('se-label').append(label)
        );
        if (description) {
          sectionTitleEl.append(
            $$('div').addClass('se-description').append(description)
          );
        }
        el.append(sectionTitleEl);
      }
      el.append(
        $$('div').addClass('se-dialog-section-content').append(children)
      );
      return el
    }
  }

  function getSettings (comp) {
    let appState = comp.context.editorState;
    return appState.settings
  }

  function renderModel ($$, comp, valueModel, options = {}) {
    let ValueComponent = comp.getComponent(valueModel.type);

    let valueSettings;
    let settings = getSettings(comp);
    if (settings) {
      valueSettings = settings.getSettingsForValue(valueModel.getPath());
    }
    let props = Object.assign({
      disabled: comp.props.disabled,
      // TODO: rename 'model' to 'value' (then we have it is clear when node and when values are used)
      model: valueModel
    }, valueSettings, options);
    return $$(ValueComponent, props)
  }

  function renderValue ($$, comp, doc, path, options = {}) {
    let prop = doc.getProperty(path);
    let valueModel = createValueModel(comp.context.editorSession, path, prop);
    return renderModel($$, comp, valueModel, options)
  }

  function NodeComponentMixin (Component) {
    return class NodeComponent extends Component {
      didMount () {
        super.didMount();
        const node = this._getNode();
        this.context.editorState.addObserver(['document'], this._onNodeUpdate, this, { document: { path: [node.id] }, stage: 'render' });
      }

      dispose () {
        super.dispose();

        this.context.editorState.off(this);
      }

      _getNode () {
        return this.props.node
      }

      _renderValue ($$, propertyName, options = {}) {
        let node = this._getNode();
        let doc = node.getDocument();
        return renderValue($$, this, doc, [node.id, propertyName], options)
      }

      _onNodeUpdate () {
        this.rerender();
      }
    }
  }

  function NodeOverlayEditorMixin (NodeComponent) {
    return class NodeComponentWithOverlayEditor extends NodeComponent {
      constructor (...args) {
        super(...args);

        this._surfaceId = this.context.parentSurfaceId + '/' + this.props.node.id;
      }

      getChildContext () {
        return {
          parentSurfaceId: this._surfaceId
        }
      }

      didMount () {
        super.didMount();

        if (this._shouldEnableOverlayEditor()) {
          // we will attach to the OverlayCanvas whenever the selection is on the annotation
          // TODO: similar as with IsolatedNodes and InlineNodes, the number of listeners will grow with
          // the size of the document. Thus, we need to introduce a means to solve this more efficiently
          this.context.editorState.addObserver(['selectionState'], this._onSelectionStateChange, this, { stage: 'render' });
          this._onSelectionStateChange(this.context.editorState.selectionState);
        }
      }

      dispose () {
        super.dispose();

        if (this._editor) {
          this._releaseOverlay();
          this._editor.triggerDispose();
          this._editor = null;
        }
      }

      _shouldEnableOverlayEditor () { return true }

      _onSelectionStateChange (selectionState) {
        let surfaceId = selectionState.selection.surfaceId;
        let isSelected = selectionState.node === this.props.node;
        if ((isSelected || (surfaceId && surfaceId.startsWith(this._surfaceId)))) {
          this._acquireOverlay({ anchor: this.el });
        } else {
          this._releaseOverlay();
        }
      }

      _getEditorClass () { throwMethodIsAbstract(); }

      _acquireOverlay (options) {
        let editor = this._getEditor();
        this.send('acquireOverlay', editor, options);
      }

      _releaseOverlay () {
        if (this._editor) {
          this.send('releaseOverlay', this._editor);
        }
      }

      _getEditor () {
        // create editor lazily to avoid that all nodes with such an overlay are creating it
        // at once in the beginning
        if (!this._editor) {
          // a detached editor component
          this._editor = this._createEditor();
        }
        return this._editor
      }

      _createEditor () {
        let EditorClass = this._getEditorClass();
        // keep a rendered editor around
        let editor = new EditorClass(this, { node: this.props.node });
        editor._render();
        editor.triggerDidMount();
        return editor
      }
    }
  }

  /**
   * A component that renders an editor in an overlay when the selection is on the annotation.
   * In contrast to most annotations, which are just toggled on/off, there are specific annotions
   * which have data attached that has to be edited in a popover, e.g. external links.
   * Note: this is experimental. I want to move away from popups driven by commands and tools.
   * On one hand, these commands were always kind of a extra overhead, without any effect other than
   * to determine if the tool should be displayed or not.
   * Furthermore, our need for more complex editors for such popover was increasing (keywords editor, inline-cell editor, etc.)
   */
  class EditableAnnotationComponent extends NodeOverlayEditorMixin(NodeComponentMixin(substance.AnnotationComponent)) {
    _onSelectionStateChange (selectionState) {
      let surfaceId = selectionState.selection.surfaceId;
      let isSelected = selectionState.annos.indexOf(this.props.node) !== -1;
      if ((isSelected || (surfaceId && surfaceId.startsWith(this._surfaceId)))) {
        // omitting the anchor leads to anchoring at the cursor position
        // however, for now I'd like to stick to element related anchoring
        // (as with inline nodes), as this is not thought through 100%.
        // Problem is, that when the selection is inside the popover, it can't be anchored
        // relative to the cursor. Anchoring with the el leads to a jump then.
        // To solve this we would need retain the first anchor and
        // and not use the element. In case of Undo however, there is no selection rectangle
        // this._acquireOverlay({ anchor: isSelected ? null : this.el })

        // Thus, for now we always position relative to the element.
        this._acquireOverlay({ anchor: this.el });
      } else {
        this._releaseOverlay();
      }
    }
  }

  class NodeComponent extends NodeComponentMixin(substance.Component) {}

  class EditableInlineNodeComponent extends NodeOverlayEditorMixin(NodeComponent) {
    render ($$) {
      return $$('span').attr('data-id', this.props.node.id)
    }
  }

  /**
    @param {string} props.text
  */
  class Tooltip extends substance.Component {
    render ($$) {
      let el = $$('div').addClass('sc-tooltip');
      el.append(this.props.text);
      return el
    }
  }

  class FormRowComponent extends substance.Component {
    render ($$) {
      const label = this.props.label;
      const issues = this.props.issues || [];
      const hasIssues = issues.length > 0;
      const children = this.props.children;

      const el = $$('div').addClass('sc-form-row');

      if (label) {
        const labelEl = $$('div').addClass('se-label').append(label);
        if (hasIssues) {
          // TODO: use issue.key and labelProvider here
          let tooltipText = issues.map(issue => issue.message).join(', ');
          labelEl.append(
            $$('div').addClass('se-warning').append(
              $$(substance.FontAwesomeIcon, { icon: 'fa-warning' }).addClass('se-icon'),
              $$(Tooltip, { text: tooltipText })
            )
          );
        }
        el.append(labelEl);
      }
      if (hasIssues) {
        el.addClass('sm-warning');
      }
      el.append(
        $$('div').addClass('se-editor').append(children)
      );
      return el
    }
  }

  class InputWithButton extends substance.Component {
    render ($$) {
      let input = this.props.input;
      let button = this.props.button;

      let el = $$('div').addClass('sc-input-with-button');

      if (input) el.append(input.addClass('se-input'));
      if (button) el.append(button.addClass('se-button'));

      return el
    }
  }

  /*
    This is overriding Substance.IsolatedInlineNodeComponent
      - to make all IsolatedNodeComponents 'open'
  */
  class IsolatedNodeComponentNew extends substance.IsolatedNodeComponent {
    constructor (parent, props, options) {
      super(parent, props, options);
      // HACK: overriding 'closed' IsolatedNodeComponents per se
      // TODO: on the long term we need to understand if it may be better to open
      // IsolatedNodes by default and only close them if needed.
      // The UX is improved much also in browsers like FF.
      // Still we need to evaluate this decision in the near future.
      this.blockingMode = 'open';
    }
  }

  const _ManagedComponentCache = new Map();

  /*
    Example:
    ```
    $$(Managed(Toolbar), { bindings: ['commandState'] })
    ```
    `commandStates` will be taken from the app-state, and merged with the other props.
    When `commandStates` is changed, Toolbar automatically will be rerendered automatically via extendProps.
  */
  function Managed (ComponentClass) {
    if (_ManagedComponentCache.has(ComponentClass)) return _ManagedComponentCache.get(ComponentClass)

    // an anonymous class that takes care of mapping props that start with $
    class ManagedComponent extends substance.Component {
      constructor (...args) {
        super(...args);

        if (!this.context.editorState) {
          throw new Error("'context.editorState' is required for Managed Components.")
        }
        this._config = this._compileManagedProps(this.props);
        this._props = this._deriveManagedProps(this.props);
      }

      didMount () {
        if (this._config) {
          this._register();
        }
      }

      willReceiveProps (newProps) {
        let config = this._compileManagedProps(newProps);
        let props = this._deriveManagedProps(newProps);
        if (!this._config && config) {
          this._register();
        } else if (this._config && !config) {
          this._deregister();
        }
        this._config = config;
        this._props = props;
      }

      dispose () {
        this.context.editorState.off(this);
      }

      render ($$) {
        return $$(ComponentClass, this._props).ref('managed')
      }

      _register () {
        const { stage, names } = this._config;
        this.context.editorState.addObserver(names, this._onUpdate, this, { stage });
      }

      _deregister () {
        this.context.editorState.off(this);
      }

      _onUpdate () {
        this._props = this._deriveManagedProps();
        this.refs.managed.extendProps(this._props);
      }

      _compileManagedProps (props) {
        let stage = 'render';
        let names = props.bindings || [];
        if (names.length > 0) {
          return { stage, names }
        } else {
          return null
        }
      }

      _deriveManagedProps (props) {
        const state = this.context.editorState;
        const config = this._config;
        if (config) {
          let derivedProps = Object.assign({}, props);
          delete derivedProps.bindings;
          config.names.forEach(name => {
            derivedProps[name] = state.get(name);
          });
          return derivedProps
        } else {
          return props
        }
      }
    }

    _ManagedComponentCache.set(ComponentClass, ManagedComponent);

    return ManagedComponent
  }

  function OverlayMixin (Component) {
    class OverlayComponent extends Component {
      didMount () {
        super.didMount();

        let appState = this.context.editorState;
        appState.addObserver(['overlayId'], this._onOverlayIdHasChanged, this, { stage: 'render' });
      }

      dispose () {
        super.dispose();

        this.context.editorState.removeObserver(this);
      }

      _getOverlayId () {
        return this.getId()
      }

      _canShowOverlay () {
        return this.context.editorState.overlayId === this._getOverlayId()
      }

      _toggleOverlay () {
        this.send('toggleOverlay', this._getOverlayId());
      }

      _onOverlayIdHasChanged () {
        // console.log('Rerendering overlay component because overlay id has changed', this._getOverlayId())
        this.rerender();
      }
    }
    return OverlayComponent
  }

  class MultiSelectInput extends OverlayMixin(substance.Component) {
    getInitialState () {
      return {
        isExpanded: this._canShowOverlay()
      }
    }

    willReceiveProps () {
      this.extendState(this.getInitialState());
    }

    render ($$) {
      const selected = this.props.selected;
      const isEmpty = selected.length === 0;
      const selectedLabels = selected.map(item => item.toString());
      const isExpanded = this.state.isExpanded;
      const label = isEmpty ? this.getLabel('multi-select-default-value') : selectedLabels.join('; ');

      const el = $$('div').addClass('sc-multi-select-input');
      if (isEmpty) el.addClass('sm-empty');
      el.addClass(isExpanded ? 'sm-expanded' : 'sm-collapsed');
      el.append(
        $$('div').addClass('se-label').text(label)
      );
      if (isExpanded) {
        el.addClass('sm-active');
        el.append(
          this._renderOptions($$)
        );
      }
      el.on('click', this._onClick)
        .on('dblclick', this._stopAndPreventDefault)
        .on('mousedown', this._stopAndPreventDefault);

      return el
    }

    _renderOptions ($$) {
      const label = this.props.label;
      const selected = this.props.selected;
      const selectedIdx = selected.map(item => item.id);
      const options = this._getOptions();
      const editorEl = $$('div').ref('options').addClass('se-select-editor').append(
        $$('div').addClass('se-arrow'),
        $$('div').addClass('se-select-label')
          .append(label)
      );
      options.forEach(option => {
        const isSelected = selectedIdx.indexOf(option.id) > -1;
        const icon = isSelected ? 'checked-item' : 'unchecked-item';
        editorEl.append(
          $$('div').addClass('se-select-item').addClass(isSelected ? 'sm-selected' : '').append(
            this.context.iconProvider.renderIcon($$, icon).addClass('se-icon'),
            $$('div').addClass('se-item-label')
              // TODO: I would like to have this implementation more agnostic of a specific data structure
              .append(option.toString()).ref(option.id)
          ).on('click', this._onToggleItem.bind(this, option))
        );
      });
      return editorEl
    }

    _getOverlayId () {
      return this.props.overlayId || this.getId()
    }

    _getOptions () {
      return this.getParent().getAvailableOptions()
    }

    _stopAndPreventDefault (event) {
      event.stopPropagation();
      event.preventDefault();
    }

    _onClick (event) {
      this._stopAndPreventDefault(event);
      super._toggleOverlay();
    }

    _onOverlayIdHasChanged () {
      let overlayId = this.context.editorState.overlayId;
      let id = this._getOverlayId();
      let needUpdate = false;
      if (this.state.isExpanded) {
        needUpdate = (overlayId !== id);
      } else {
        needUpdate = (overlayId === id);
      }
      if (needUpdate) {
        this.extendState(this.getInitialState());
      }
    }

    _onToggleItem (option, event) {
      event.stopPropagation();
      event.preventDefault();
      this.send('toggleOption', option);
    }
  }

  class ManyRelationshipComponent extends ValueComponent {
    didMount () {
      // ATTENTION: relationships are unfortunately tricky regarding updates
      // obvious things are covered by the used helper, e.g., if the model is changed
      // or a one of the used targets has been removed
      // Other things are pretty much impossible to detect in a general way
      // e.g. the creation of a new target, or the deletion of an existing one
      // In this case the selection will be out of sync, and hopefully the implementation does react correctly
      // TODO: make sure that this is the case
      this.context.editorState.addObserver(['document'], this._rerenderOnModelChangeIfNecessary, this, { stage: 'render' });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    render ($$) {
      const label = this.getLabel('select-item') + ' ' + this.props.label;
      const options = this.getAvailableOptions();
      let selected = this._getSelectedOptions(options);
      let el = $$('div').addClass(this._getClassNames());
      if (this.context.editable) {
        el.append(
          $$(MultiSelectInput, {
            label,
            selected,
            overlayId: this.props.model.id
          })
        );
      } else {
        const selectedLabels = selected.map(item => item ? item.toString() : null).filter(Boolean);
        let label = selectedLabels.join('; ');
        el.addClass('sm-readonly').append(label);
      }
      return el
    }

    _getClassNames () {
      return 'sc-many-relationship'
    }

    getActionHandlers () {
      return {
        toggleOption: this._toggleTarget,
        toggleOverlay: this._toggleOverlay
      }
    }

    getAvailableOptions () {
      return this.props.model.getAvailableOptions()
    }

    _getSelectedOptions (options) {
      // pick all selected items from options this makes life easier for the MutliSelectComponent
      // because it does not need to map via ids, just can check equality
      let targetIds = this.props.model.getValue();
      let selected = targetIds.map(id => options.find(item => item.id === id)).filter(Boolean);
      return selected
    }

    _toggleTarget (target) {
      if (this.context.editable) {
        this.props.model.toggleTarget(target);
      }
    }

    _toggleOverlay () {
      const appState = this.context.editorState;
      let overlayId = appState.overlayId;
      let modelId = this.props.model.id;
      if (overlayId === modelId) {
        this.getParent().send('toggleOverlay');
      } else {
        // ATTENTION: At the moment a reducer maps value selections to appState.overlayId
        // i.e. we must not call toggleOverlay
        // But if we decided to disable the reducer this would break if
        // we used the common implementation.
        // TODO: rethink this approach in general
        this.context.api.selectValue(this._getPath());
        // DO NOT UNCOMMENT THIS LINE
        // appState.set('overlayId', modelId, 'propagateImmediately')
      }
    }

    _rerenderOnModelChangeIfNecessary (change) {
      let updateNeeded = Boolean(change.hasUpdated(this._getPath()));
      if (!updateNeeded) {
        let ids = this.props.model.getValue();
        if (ids) {
          if (!substance.isArray(ids)) {
            ids = [ids];
          }
          for (let id of ids) {
            if (change.hasDeleted(id) || change.hasUpdated(id)) {
              updateNeeded = true;
              break
            }
          }
        }
      }
      if (updateNeeded) {
        this._rerenderOnModelChange();
      }
    }

    _rerenderOnModelChange () {
      // console.log('Rerendering RelationshipComponent because model has changed', this._getPath())
      this.rerender();
    }
  }

  /**
    ModalDialog component

    @class
    @component

    @prop {String} width 'small', 'medium', 'large' and 'full'

    @example

    ```js
    var form = $$(ModalDialog, {
      width: 'medium',
      textAlign: 'center'
    });
    ```
  */
  class ModalDialog extends substance.Component {
    getActionHandlers () {
      return {
        'close': this.close
      }
    }

    render ($$) {
      let width = this.props.width || 'large';
      let el = $$('div').addClass(this._getClassName());
      if (this.props.width) {
        el.addClass('sm-width-' + width);
      }
      if (this.props.transparent) {
        el.addClass('sm-transparent-bg');
      }
      el.on('keydown', this._onKeydown);

      let verticalContainer = $$('div').addClass('se-vertical-container');
      let horizontalContainer = $$('div').addClass('se-horizontal-container');
      horizontalContainer.append(
        $$('div').addClass('se-horizontal-spacer'),
        this._renderModalBody($$),
        $$('div').addClass('se-horizontal-spacer')
      );
      verticalContainer.append(
        $$('div').addClass('se-vertical-spacer'),
        horizontalContainer,
        $$('div').addClass('se-vertical-spacer')
      );
      el.append(verticalContainer);

      return el
    }

    _getClassName () {
      return 'sc-modal-dialog'
    }

    _renderModalBody ($$) {
      const Button = this.getComponent('button');
      const closeButton = $$(Button, {
        icon: 'close'
      }).addClass('se-close-button')
        .on('click', this._onCloseButtonClick);
      let modalBody = $$('div').addClass('se-body').ref('body');
      // ATTENTION: it is not possible to set a ref on a component passed in as prop (different owner)
      modalBody.append(
        this.props.content.addClass('se-content')
      );
      modalBody.append(closeButton);
      return modalBody
    }

    _onKeydown (e) {
      e.stopPropagation();
    }

    _onCloseButtonClick (e) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }

    close () {
      // let the content handl
      let content = this._getContent();
      if (content.beforeClose) {
        let result = content.beforeClose();
        if (result === false) {
          return
        }
      }
      this.send('closeModal');
    }

    _getContent () {
      // Unfortunately we can not have a ref on the content,
      // because it is passed as property.
      // ATM, Substance allows only the owner to set a ref.
      // Thus, we have to find the component manually.
      return this.refs.body.getChildren().find(c => c.el.hasClass('se-content'))
    }
  }

  class ModelComponent extends substance.Component {
    didMount () {
      addModelObserver(this.props.model, this.rerender, this);
    }

    dispose () {
      removeModelObserver(this);
    }

    // EXPERIMENTAL:
    // trying to avoid unnecessary rerenderings
    shouldRerender (newProps) {
      return newProps.model !== this.props.model
    }
  }

  /*
    Overridden version of Substance.Surface with modifications from 'ModifiedSurface'
  */
  class SurfaceNew extends ModifiedSurface(substance.Surface) {}

  class TextInput extends SurfaceNew {
    render ($$) {
      const TextPropertyComponent = this.getComponent('text-property');
      const placeholder = this.props.placeholder;
      const path = this.props.path;
      const isEditable = this.isEditable();
      // TODO: we should refactor Substance.TextPropertyEditor so that it can be used more easily
      let el = SurfaceNew.prototype.render.apply(this, arguments);
      el.addClass('sc-text-input');
      // Attention: being disabled does not necessarily mean not-editable, whereas non-editable is always disabled
      // A Surface can also be disabled because it is blurred, for instance.
      if (isEditable) {
        el.addClass('sm-editable');
        if (!this.props.disabled) {
          el.addClass('sm-enabled');
          el.attr('contenteditable', true);
          // native spellcheck
          el.attr('spellcheck', this.props.spellcheck === 'native');
        }
      } else {
        el.addClass('sm-readonly');
      }
      let content = $$(TextPropertyComponent, {
        doc: this.getDocument(),
        tagName: 'div',
        placeholder,
        path
      }).addClass('se-input');
      el.append(content);
      return el
    }

    // this is needed e.g. by SelectAllCommand
    get _isTextPropertyEditor () {
      return true
    }

    // this is needed e.g. by SelectAllCommand
    getPath () {
      return this.props.path
    }
  }

  class StringComponent extends substance.Component {
    render ($$) {
      let placeholder = this.props.placeholder;
      let model = this.props.model;
      let path = model.getPath();
      let name = substance.getKeyForPath(path);
      let el = $$('div').addClass(this.getClassNames());
      if (this.props.readOnly) {
        let doc = this.context.api.getDocument();
        let TextPropertyComponent = this.getComponent('text-property');
        el.append(
          $$(TextPropertyComponent, {
            doc,
            tagName: 'div',
            placeholder,
            path
          })
        );
      } else {
        el.append(
          $$(TextInput, {
            name,
            path,
            placeholder
          })
        );
      }
      return el
    }

    getClassNames () {
      return 'sc-string'
    }
  }

  class TextComponent extends StringComponent {
    getClassNames () {
      return 'sc-text'
    }
  }

  class ObjectComponent extends ValueComponent {
    render ($$) {
      let el = $$('div').addClass('sc-object');
      // TODO: implement a default editor for object type values
      return el
    }
  }

  class SingleRelationshipComponent extends ManyRelationshipComponent {
    _getClassNames () {
      return 'sc-single-relationship'
    }

    _getSelectedOptions (options) {
      let targetId = this.props.model.getValue();
      if (!targetId) return []
      let selectedOption = options.find(item => {
        if (item) return item.id === targetId
      });
      let selected = selectedOption ? [selectedOption] : [];
      return selected
    }
  }

  class TextNodeComponent extends substance.Component {
    /*
      NOTE: text updates are observed by TextPropertyComponent
      If necessary override this method and add other observers
    */
    didMount () {}

    render ($$) {
      let parentSurface = this.context.surface;
      let TextPropertyComponent;
      // render the TextNode as Surface if the parent is not a ContainerEditor
      if (parentSurface && parentSurface.isContainerEditor()) {
        // Note: when inside a ContainerEditor, then this is not a editor itself
        TextPropertyComponent = this.getComponent('text-property');
      } else {
        TextPropertyComponent = this.getComponent('text-property-editor');
      }
      const node = this.props.node;
      const tagName = this.getTagName();
      const path = node.getPath();
      let el = $$(tagName)
        .addClass(this.getClassNames())
        .attr('data-id', node.id);
      el.append(
        $$(TextPropertyComponent, {
          doc: node.getDocument(),
          name: substance.getKeyForPath(path),
          path,
          placeholder: this.props.placeholder
        })
      );
      // TODO: ability to edit attributes
      return el
    }

    getTagName () {
      return 'div'
    }

    getClassNames () {
      // TODO: don't violate the 'sc-' contract
      return 'sc-text-node sm-' + this.props.node.type
    }
  }

  var ModelComponentPackage = {
    name: 'Model Components',
    configure (configurator) {
      // TODO: maybe we want to use just '<type>' as name instead of '<type>-model'
      configurator.addComponent('boolean', BooleanComponent);
      configurator.addComponent('child', ChildComponent);
      // TODO: do we need this anymore?
      configurator.addComponent('collection', CollectionComponent);
      configurator.addComponent('many-relationship', ManyRelationshipComponent);
      configurator.addComponent('object', ObjectComponent);
      configurator.addComponent('single-relationship', SingleRelationshipComponent);
      configurator.addComponent('string', StringComponent);
      configurator.addComponent('text', TextComponent);
      // LEGACY
      // TODO: do we need this anymore?
      configurator.addComponent('text-node', TextNodeComponent);
    }
  };

  class OverlayCanvas extends substance.Component {
    constructor (...args) {
      super(...args);

      this._items = new Map();
    }
    didMount () {
      super.didMount();

      this._positionOverlay();

      // TODO: avoid using appState directly, instead use a Managed component
      this.context.editorState.addObserver(['@any'], this._reset, this, { stage: 'update' });
      this.context.editorState.addObserver(['@any'], this._updateOverlayCanvas, this, { stage: 'post-render' });
      this.context.editorState.addObserver(['@any'], this._positionOverlay, this, { stage: 'position' });
    }

    dispose () {
      super.dispose();

      this.context.editorState.removeObserver(this);
      this._items.length = 0;
      this.refs.canvas.empty();
    }

    didUpdate () {
      super.didUpdate();

      this._positionOverlay();
    }

    // This component manages itself and does not need to be rerendered
    shouldRerender () { return false }

    render ($$) {
      let el = $$('div').addClass('sc-overlay-canvas');
      el.addClass('sm-hidden');
      el.addClass('sm-theme-' + this.getTheme());
      el.append(
        $$('div').addClass('se-canvas').ref('canvas')
      );
      return el
    }

    getTheme () {
      // HACK: falling back to 'light' in a hard-coded way
      return this.props.theme || 'light'
    }

    acquireOverlay (comp, options = {}) {
      // if (!this._items.has(comp.__id__)) console.log('acquiring overlay', comp, comp.__id__)
      this._toBeAdded.push({ comp, options });
    }

    releaseOverlay (comp) {
      if (this._items.has(comp.__id__)) {
        // console.log('releasing overlay', comp, comp.__id__)
        this._toBeRemoved.push(comp);
      }
    }

    _reset () {
      this._toBeAdded = [];
      this._toBeRemoved = [];
    }

    _updateOverlayCanvas () {
      this._toBeRemoved.forEach(comp => {
        this._items.delete(comp.__id__);
        comp.el.remove();
      });
      this._toBeAdded.forEach(entry => {
        let id = entry.comp.__id__;
        let alreadyThere = this._items.has(id);
        this._items.set(id, entry);
        if (!alreadyThere) {
          this.refs.canvas.getElement().append(entry.comp.getElement());
        }
      });
    }

    _getCurrentOverlayContent () {
      return this.refs.canvas.getChildAt(0)
    }

    _clearCanvas () {
      this.refs.canvas.getElement().empty();
    }

    _getContentPanel () {
      return this.props.panel || this.props.panelProvider()
    }

    _positionOverlay () {
      if (this._items.size === 0) {
        this.el.addClass('sm-hidden');
        return
      }
      const firstItem = this._items.values().next().value;
      const contentPanel = this._getContentPanel();
      let contentRect = contentPanel._getContentRect();
      let anchorEl = firstItem.options.anchor;
      let anchorRect;
      let scrollIntoView = false;
      if (anchorEl) {
        anchorRect = substance.getRelativeRect(contentRect, anchorEl.getNativeElement().getBoundingClientRect());
      } else {
        anchorRect = contentPanel._getSelectionRect();
        scrollIntoView = true;
      }
      this.el.removeClass('sm-hidden');
      let overlayWidth = this.el.htmlProp('offsetWidth');
      // TODO: is it really possible that this is null?
      if (anchorRect) {
        let anchorMaxWidth = anchorRect.width;
        // By default, Overlays are aligned center/bottom to the selection
        this.el.css('top', anchorRect.top + anchorRect.height);
        let leftPos = anchorRect.left + anchorMaxWidth / 2 - overlayWidth / 2;
        // Must not exceed left bound
        leftPos = Math.max(leftPos, 0);
        // Must not exceed right bound
        let maxLeftPos = anchorRect.left + anchorMaxWidth + anchorRect.right - overlayWidth;
        leftPos = Math.min(leftPos, maxLeftPos);
        this.el.css('left', leftPos);
        if (scrollIntoView) {
          contentPanel._scrollRectIntoView(anchorRect);
        }
      } else {
        this.el.addClass('sm-hidden');
      }
    }
  }

  class PinnedMessage extends substance.Component {
    render ($$) {
      const icon = this.props.icon;
      const label = this.props.label;

      const el = $$('div').addClass('sc-pinned-message');
      const wrapper = $$('div').addClass('se-msg-wrap');

      if (icon) {
        wrapper.append(
          $$(substance.FontAwesomeIcon, { icon }).addClass('se-icon')
        );
      }

      if (label) {
        wrapper.append(
          $$('div').addClass('se-msg')
            .append(label)
        );
      }

      el.append(wrapper);

      return el
    }
  }

  /**
    Wraps content in a scroll pane.

    NOTE: It is best practice to put all overlays as direct childs of the ScrollPane
          to reduce the chance that positioning gets messed up (position: relative)

    @prop {String} scrollbarType 'native' or 'substance' for a more advanced visual scrollbar. Defaults to 'native'
    @prop {String} [scrollbarPosition] 'left' or 'right' only relevant when scrollBarType: 'substance'. Defaults to 'right'
    @prop {ui/Highlights} [highlights] object that maintains highlights and can be manipulated from different sources

    @example

    ```js
    $$(ScrollPane, {
      scrollbarType: 'substance', // defaults to native
      scrollbarPosition: 'left', // defaults to right
      onScroll: this.onScroll.bind(this),
      highlights: this.contentHighlights,
    })
    ```
  */
  class ScrollPane extends AbstractScrollPane {
    didMount () {
      super.didMount();

      if (this.refs.scrollbar) {
        if (substance.platform.inBrowser) {
          this.domObserver = new window.MutationObserver(this._onContentChanged.bind(this));
          this.domObserver.observe(this.el.getNativeElement(), {
            subtree: true,
            attributes: true,
            characterData: true,
            childList: true
          });
        }
      }
    }

    dispose () {
      super.dispose();

      if (this.domObserver) {
        this.domObserver.disconnect();
      }
    }

    render ($$) {
      let el = $$('div')
        .addClass('sc-scroll-pane');

      if (substance.platform.isFF) {
        el.addClass('sm-firefox');
      }

      // When noStyle is provided we just use ScrollPane as a container, but without
      // any absolute positioned containers, leaving the body scrollable.
      if (!this.props.noStyle) {
        el.addClass('sm-default-style');
      }

      // Initialize Substance scrollbar (if enabled)
      if (this.props.scrollbarType === 'substance') {
        el.addClass('sm-substance-scrollbar');
        el.addClass('sm-scrollbar-position-' + this.props.scrollbarPosition);

        el.append(
          // TODO: is there a way to pass scrollbar highlights already
          // via props? Currently the are initialized with a delay
          $$(substance.Scrollbar, {
            scrollPane: this
          }).ref('scrollbar')
            .attr('id', 'content-scrollbar')
        );

        // Scanline is debugging purposes, display: none by default.
        el.append(
          $$('div').ref('scanline').addClass('se-scanline')
        );
      }

      el.append(
        $$('div').ref('scrollable').addClass('se-scrollable').append(
          this.renderContent($$)
        ).on('scroll', this.onScroll)
      );
      return el
    }

    renderContent ($$) {
      let contentEl = $$('div').ref('content').addClass('se-content');
      contentEl.append(this.props.children);
      if (this.props.contextMenu === 'custom') {
        contentEl.on('contextmenu', this._onContextMenu);
      }
      return contentEl
    }

    _onContentChanged () {
      this._contentChanged = true;
    }

    _afterRender () {
      super._afterRender();

      if (this.refs.scrollbar && this._contentChanged) {
        this._contentChanged = false;
        this._updateScrollbar();
      }
    }

    _updateScrollbar () {
      if (this.refs.scrollbar) {
        this.refs.scrollbar.updatePositions();
      }
    }

    onScroll () {
      let scrollPos = this.getScrollPosition();
      let scrollable = this.refs.scrollable;
      if (this.props.onScroll) {
        this.props.onScroll(scrollPos, scrollable);
      }
      this.emit('scroll', scrollPos, scrollable);
    }

    /**
      Returns the height of scrollPane (inner content overflows)
    */
    getHeight () {
      let scrollableEl = this.getScrollableElement();
      return scrollableEl.height
    }

    /**
      Returns the cumulated height of a panel's content
    */
    getContentHeight () {
      let contentEl = this.refs.content.el.getNativeElement();
      // Important to use scrollHeight here (e.g. to consider overflowing
      // content, that stretches the content area, such as an overlay or
      // a context menu)
      return contentEl.scrollHeight
    }

    /**
      Get the `.se-content` element
    */
    getContentElement () {
      return this.refs.content.el
    }

    /**
      Get the `.se-scrollable` element
    */
    getScrollableElement () {
      return this.refs.scrollable.el
    }

    /**
      Get current scroll position (scrollTop) of `.se-scrollable` element
    */
    getScrollPosition () {
      let scrollableEl = this.getScrollableElement();
      return scrollableEl.getProperty('scrollTop')
    }

    setScrollPosition (scrollPos) {
      // console.log('ScrollPane.setScrollPosition()')
      let scrollableEl = this.getScrollableElement();
      scrollableEl.setProperty('scrollTop', scrollPos);
    }

    /**
      Get offset relative to `.se-content`.

      @param {DOMNode} el DOM node that lives inside the
    */
    getPanelOffsetForElement (el) {
      let contentContainerEl = this.refs.content.el;
      let rect = substance.getRelativeBoundingRect(el, contentContainerEl);
      return rect.top
    }

    /**
      Scroll to a given sub component.

      @param {String} componentId component id, must be present in data-id attribute
    */
    scrollTo (selector, onlyIfNotVisible) {
      // console.log('ScrollPane.scrollTo()', selector)
      let scrollableEl = this.getScrollableElement();
      let el = scrollableEl.find(selector);
      if (el) {
        this.scrollElementIntoView(el, onlyIfNotVisible);
      } else {
        console.warn(`No match found for selector '${selector}' in scrollable container`);
      }
    }

    scrollElementIntoView (el, onlyIfNotVisible) {
      // console.log('ScrollPane.scrollTo()', selector)
      let scrollableEl = this.getScrollableElement();
      const offset = this.getPanelOffsetForElement(el);
      let shouldScroll = true;
      if (onlyIfNotVisible) {
        const height = scrollableEl.height;
        const oldOffset = scrollableEl.getProperty('scrollTop');
        shouldScroll = (offset < oldOffset || oldOffset + height < offset);
      }
      if (shouldScroll) {
        this.setScrollPosition(offset);
      }
    }

    _onResize (...args) {
      super._onResize(...args);
      this._updateScrollbar();
    }

    _onContextMenu (e) {
      super._onContextMenu(e);
      this._updateScrollbar();
    }
  }

  class TextPropertyEditorNew extends ModifiedSurface(substance.TextPropertyEditor) {}

  /**
   *
   * @param {string} props.style menu style, one of 'minimal', 'descriptive', 'full'
   * @param {string} props.theme
   * @param {object} props.item
   * @param {object} props.commandState
   */
  class Tool extends substance.Component {
    render ($$) {
      const { style, theme, commandState } = this.props;
      let el;
      switch (style) {
        case 'minimal': {
          el = $$(Button, {
            style,
            theme,
            icon: this._getIconName(),
            tooltip: this._getTooltipText()
          });
          break
        }
        case 'descriptive': {
          // TODO: try to use Button instead
          el = $$('button');
          el.append(
            this._renderLabel($$),
            this._renderKeyboardShortcut($$)
          );
          break
        }
        default: {
          // TODO: try to use Button instead
          el = $$('button');
          el.append(
            this._renderIcon($$),
            this._renderLabel($$),
            this._renderKeyboardShortcut($$)
          );
        }
      }
      el.addClass(this.getClassNames());
      el.on('click', this._onClick)
        // ATTENTION: we need to preventDefault on mousedown, otherwise
        // native DOM selection disappears
        .on('mousedown', this._onMousedown);

      if (commandState.active) {
        el.addClass('sm-active');
      }
      if (commandState.disabled) {
        // make button inaccessible
        el.attr('tabindex', -1)
          .attr('disabled', true);
      } else {
        // make button accessible for tab-navigation
        el.attr('tabindex', 1);
      }

      return el
    }

    click () {
      return this.el.click()
    }

    executeCommand (params) {
      const { item, commandState } = this.props;
      // TODO: rethink this. Should we inhibit command execution here
      // or rely on the command not to execute when disabled?
      if (!commandState.disabled) {
        this.send('executeCommand', item.name, params);
      }
    }

    getClassNames () {
      return `sc-tool sm-${this.props.item.name}`
    }

    _getLabel () {
      const { item, commandState } = this.props;
      const labelName = item.label || item.name;
      const labelProvider = this.context.labelProvider;
      return labelProvider.getLabel(labelName, commandState)
    }

    _getIconName () {
      const item = this.props.item;
      const iconName = item.icon || item.name;
      return iconName
    }

    _getKeyboardShortcut () {
      const name = this.props.item.name;
      const config = this.context.config;
      let entry = config.getKeyboardShortcutsByCommandName(name);
      if (entry) {
        return entry.label
      }
    }

    _getTooltipText () {
      const label = this._getLabel();
      const keyboardShortcut = this._getKeyboardShortcut();
      if (keyboardShortcut) {
        return [label, ' (', keyboardShortcut, ')'].join('')
      } else {
        return label
      }
    }

    _renderLabel ($$) {
      return $$('div').addClass('se-label').append(
        this._getLabel()
      )
    }

    _renderIcon ($$) {
      const iconName = this._getIconName();
      return $$('div').addClass('se-icon').append(
        this.context.iconProvider.renderIcon($$, iconName)
      )
    }

    _renderKeyboardShortcut ($$) {
      const keyboardShortcut = this._getKeyboardShortcut();
      return $$('div').addClass('se-keyboard-shortcut').append(
        keyboardShortcut || ''
      )
    }

    _onClick (e) {
      e.preventDefault();
      e.stopPropagation();
      this.executeCommand();
    }

    _onMousedown (e) {
      e.preventDefault();
    }

    // this is used by TextureConfigurator
    get _isTool () {
      return true
    }
  }

  /**
   * @param {string} props.style
   * @param {string} props.theme
   * @param {object} props.item
   * @param {object} props.commandState
   */
  class ToggleTool extends Tool {
    getClassNames () {
      return `sc-toggle-tool sc-tool sm-${this.props.item.name}`
    }
  }

  class Toolbar extends ToolPanel {
    render ($$) {
      let el = $$('div').addClass('sc-toolbar');
      el.append(
        $$('div').addClass('se-active-tools').append(
          this._renderItems($$)
        ).ref('entriesContainer')
      );
      return el
    }
  }

  // TODO: use OverlayMixin to avoid code redundancy
  class ToolDropdown extends ToolGroup {
    didMount () {
      this.context.editorState.addObserver(['overlayId'], this.rerender, this, { stage: 'render' });
    }
    dispose () {
      this.context.editorState.removeObserver(this);
    }
    render ($$) {
      const appState = this.context.editorState;
      const { commandStates, style, theme, hideDisabled, alwaysVisible } = this.props;
      const toggleName = this._getToggleName();
      const hasEnabledItem = this._derivedState.hasEnabledItem;
      const showChoices = appState.overlayId === this.getId();

      let el = $$('div').addClass('sc-tool-dropdown');
      el.addClass('sm-' + this.props.name);

      if (!hasEnabledItem) {
        el.addClass('sm-disabled');
      } else if (showChoices) {
        el.addClass('sm-open');
      }

      if (!hideDisabled || hasEnabledItem || alwaysVisible) {
        const Button = this.getComponent('button');
        let toggleButtonProps = {
          dropdown: true,
          active: showChoices,
          theme,
          // HACK: we are passing the command state allowing to render labels with template strings
          commandState: commandStates[toggleName]
        };
        if (style === 'minimal') {
          toggleButtonProps.icon = toggleName;
        } else {
          toggleButtonProps.label = toggleName;
        }
        let toggleButton = $$(Button, toggleButtonProps).ref('toggle')
          .addClass('se-toggle')
          .on('click', this._onClick)
          // ATTENTION: we need to preventDefault on mousedown, otherwise
          // native DOM selection disappears
          .on('mousedown', this._onMousedown);
        el.append(toggleButton);

        if (showChoices) {
          el.append(
            $$('div').addClass('se-choices').append(
              this._renderItems($$)
            ).ref('choices')
          );
        } else if (style === 'minimal' || toggleName !== this.props.name) {
          // NOTE: tooltips are only rendered when explanation is needed
          el.append(
            this._renderToolTip($$)
          );
        }
      }
      return el
    }

    _renderToolTip ($$) {
      let labelProvider = this.context.labelProvider;
      return $$(Tooltip, {
        text: labelProvider.getLabel(this.props.name)
      })
    }

    get _isTopLevel () {
      return true
    }

    _deriveState (props) {
      super._deriveState(props);

      if (this.props.displayActiveCommand) {
        this._derivedState.activeCommandName = this._getActiveCommandName(props.items, props.commandStates);
      }
    }

    _getActiveCommandName (items, commandStates) {
      // FIXME: getting an active commandName does only make sense for a flat dropdown
      for (let item of items) {
        if (item.type === 'command') {
          const commandName = item.name;
          let commandState = commandStates[commandName];
          if (commandState && commandState.active) {
            return commandName
          }
        }
      }
    }

    _getToggleName () {
      if (this.props.displayActiveCommand) {
        return this._derivedState.activeCommandName || this.props.name
      } else {
        return this.props.name
      }
    }

    _onMousedown (event) {
      event.preventDefault();
    }

    _onClick (event) {
      event.preventDefault();
      event.stopPropagation();
      if (this._hasChoices()) {
        this.send('toggleOverlay', this.getId());
      }
    }

    _hasChoices () {
      return (!this.props.hideDisabled || this._derivedState.hasEnabledItem)
    }
  }

  class ToolSpacer extends substance.Component {
    render ($$) {
      return $$('div').addClass('sc-tool-spacer')
    }
  }

  const ESCAPE = substance.parseKeyEvent(substance.parseKeyCombo('Escape'));

  class Input extends substance.Component {
    render ($$) {
      let { path, type, placeholder } = this.props;
      let val = this._getDocumentValue();

      let el = $$('input').attr({
        value: val,
        type,
        placeholder
      }).addClass('sc-input')
        .val(val)
        .on('keydown', this._onKeydown);
      if (path) {
        el.on('change', this._onChange);
      }
      return el
    }

    submit () {
      let editorSession = this.context.editorSession;
      let path = this.props.path;
      let newVal = this.el.val();
      let oldVal = this._getDocumentValue();
      if (newVal !== oldVal) {
        editorSession.transaction(function (tx) {
          tx.set(path, newVal);
        });
        return true
      }
    }

    focus () {
      this.el.getNativeElement().focus();
    }

    _onChange () {
      if (this.submit() && this.props.retainFocus) {
        // ATTENTION: running the editor flow will rerender the model selection
        // which takes away the focus from this input
        this.focus();
      }
    }

    _getDocumentValue () {
      if (this.props.val) {
        return this.props.val
      } else {
        let editorSession = this.context.editorSession;
        let path = this.props.path;
        return editorSession.getDocument().get(path)
      }
    }

    _onKeydown (event) {
      let combo = substance.parseKeyEvent(event);
      switch (combo) {
        // ESCAPE reverts the current pending change
        case ESCAPE: {
          event.stopPropagation();
          event.preventDefault();
          this.el.val(this._getDocumentValue());
          break
        }
        default:
          // nothing
      }
    }
  }

  class ToolSeparator extends substance.Component {
    render ($$) {
      const label = this.props.label;
      let el = $$('div').addClass('sc-tool-separator');
      if (label) {
        el.append(
          $$('div').addClass('se-label').append(
            this.getLabel(label)
          )
        );
      }
      return el
    }
  }

  var BasePackage = {
    name: 'TextureBase',
    configure: function (configurator) {
      configurator.addComponent('annotation', substance.AnnotationComponent);
      // customized built-ins
      configurator.addComponent('container-editor', ContainerEditorNew);
      configurator.addComponent('isolated-node', IsolatedNodeComponentNew);
      configurator.addComponent('inline-node', substance.IsolatedInlineNodeComponent);
      configurator.addComponent('text-property', substance.TextPropertyComponent);
      configurator.addComponent('text-property-editor', TextPropertyEditorNew);
      configurator.addComponent('text-input', TextInput);

      // replacing Substance components with custom ones
      configurator.addComponent('scroll-pane', ScrollPane);
      configurator.addComponent('body-scroll-pane', BodyScrollPane);

      configurator.addComponent('button', Button);
      configurator.addComponent('context-menu', ContextMenu);
      configurator.addComponent('input', Input);
      configurator.addComponent('modal', ModalDialog);
      configurator.addComponent('overlay-canvas', OverlayCanvas);
      configurator.addComponent('tool', Tool);
      // TODO: remove toggle-tool
      configurator.addComponent('toggle-tool', ToggleTool);
      configurator.addComponent('toolbar', Toolbar);
      configurator.addComponent('tool-dropdown', ToolDropdown);
      configurator.addComponent('tool-group', ToolGroup);
      configurator.addComponent('tool-separator', ToolSeparator);
      configurator.addComponent('tool-spacer', ToolSpacer);

      configurator.addLabel('text-types', {
        en: 'Text Type',
        de: 'Texttyp'
      });
      configurator.addLabel('container-selection', {
        en: 'Container',
        de: 'Container'
      });
      configurator.addLabel('@container', {
        en: 'Container',
        de: 'Container'
      });

      configurator.addIcon('dropdown', { 'fontawesome': 'fa-angle-down' });
    }
  };

  var EditorBasePackage = {
    name: 'EditorBase',
    configure: function (config) {
      config.addCommand('undo', substance.UndoCommand, { commandGroup: 'undo-redo' });
      config.addCommand('redo', substance.RedoCommand, { commandGroup: 'undo-redo' });
      config.addCommand('select-all', substance.SelectAllCommand, { commandGroup: 'selection' });

      config.addIcon('insert', { 'fontawesome': 'fa-plus' });
      config.addIcon('undo', { 'fontawesome': 'fa-undo' });
      config.addIcon('redo', { 'fontawesome': 'fa-repeat' });
      config.addIcon('edit', { 'fontawesome': 'fa-cog' });
      config.addIcon('delete', { 'fontawesome': 'fa-times' });
      config.addIcon('expand', { 'fontawesome': 'fa-arrows-h' });
      config.addIcon('truncate', { 'fontawesome': 'fa-arrows-h' });

      config.addLabel('undo', {
        en: 'Undo',
        de: 'Rückgängig'
      });
      config.addLabel('redo', {
        en: 'Redo',
        de: 'Wiederherstellen'
      });
      config.addLabel('select-all', {
        en: 'Select All',
        de: 'Alles Auswählen'
      });
      config.addLabel('close', {
        en: 'Close',
        de: 'Schließen'
      });

      config.addKeyboardShortcut('CommandOrControl+Z', { command: 'undo' });
      config.addKeyboardShortcut('CommandOrControl+Shift+Z', { command: 'redo' });
      config.addKeyboardShortcut('CommandOrControl+A', { command: 'select-all' });
    }
  };

  class Table extends substance.DocumentNode {
    constructor (...args) {
      super(...args);

      this._matrix = null;
      this._rowIds = new Set();
      this._cellIds = new Set();
      this._sha = Math.random();

      this._enableCaching();
    }

    get (cellId) {
      if (!this._cellIds.has(cellId)) throw new Error('Cell is not part of this table.')
      return this.document.get(cellId)
    }

    getCellMatrix () {
      if (!this._matrix) {
        let spanningCells = [];
        let rows = this.getRows();
        let matrix = rows.map((row, rowIdx) => {
          let cells = row.getCells();
          for (let colIdx = 0; colIdx < cells.length; colIdx++) {
            let c = cells[colIdx];
            c.rowIdx = rowIdx;
            c.colIdx = colIdx;
            c.shadowed = false;
            if (c.colspan || c.rowspan) {
              spanningCells.push(c);
            }
          }
          return cells
        });
        spanningCells.forEach(c => {
          _shadowSpanned(matrix, c.rowIdx, c.colIdx, c.rowspan, c.colspan, c);
        });
        this._matrix = matrix;
      }
      return this._matrix
    }

    getRowCount () {
      return this.rows.length
    }

    getColumnCount () {
      if (this.rows.length === 0) return 0
      let doc = this.getDocument();
      let firstRow = doc.get(this.rows[0]);
      return firstRow.cells.length
    }

    getDimensions () {
      return [this.getRowCount(), this.getColumnCount()]
    }

    getRowAt (rowIdx) {
      let doc = this.getDocument();
      return doc.get(this.rows[rowIdx])
    }

    getCell (rowIdx, colIdx) {
      const matrix = this.getCellMatrix();
      let row = matrix[rowIdx];
      if (row) {
        return row[colIdx]
      }
    }

    getRows () {
      return substance.documentHelpers.getNodesForIds(this.getDocument(), this.rows)
    }

    _enableCaching () {
      // this hook is used to invalidate cached positions
      if (this.document) {
        this._rowIds = new Set(this.rows);
        let cellIds = this.getRows().reduce((arr, row) => {
          return arr.concat(row.cells)
        }, []);
        this._cellIds = new Set(cellIds);
        this.document.data.on('operation:applied', this._onOperationApplied, this);
      }
    }

    _onOperationApplied (op) {
      if (!op.path) return
      let nodeId = op.path[0];
      let hasChanged = false;
      // whenever a row is added or removed
      if (nodeId === this.id && op.path[1] === 'rows') {
        let update = op.getValueOp();
        if (update.isDelete()) {
          this._rowIds.delete(update.getValue());
        } else if (update.isInsert()) {
          let rowId = update.getValue();
          let row = this.document.get(rowId);
          row.cells.forEach(cellId => {
            this._cellIds.add(cellId);
          });
          this._rowIds.add(rowId);
        }
        hasChanged = true;
      // whenever a row is changed belonging to this table
      } else if (this._rowIds.has(nodeId) && op.path[1] === 'cells') {
        let update = op.getValueOp();
        if (update.isDelete()) {
          this._cellIds.delete(update.getValue());
        } else if (update.isInsert()) {
          this._cellIds.add(update.getValue());
        }
        hasChanged = true;
      // whenever rowspan/colspan of cell is changed, that belongs to this table
      } else if (this._cellIds.has(nodeId) && (op.path[1] === 'rowspan' || op.path[1] === 'colspan')) {
        hasChanged = true;
      }
      if (hasChanged) {
        this._matrix = null;
        // HACK: using a quasi-sha to indicate that this table has been
        // changed structurally
        this._sha = Math.random();
      }
    }

    _hasShaChanged (sha) {
      return (this._sha !== sha)
    }

    _getSha () {
      return this._sha
    }

    static getTemplate (options = {}) {
      let headerRowCount = options.headerRows || 1;
      let rowCount = options.rows || 3;
      let colCount = options.cols || 4;

      return {
        type: 'table',
        id: options.id,
        rows: Table.getRowsTemplate(headerRowCount, colCount, true)
          .concat(Table.getRowsTemplate(rowCount, colCount))
      }
    }

    static getRowsTemplate (rowCount, colCount, heading) {
      return Array(rowCount).fill().map(_ => {
        return {
          type: 'table-row',
          cells: Table.getCellsTemplate(colCount, heading)
        }
      })
    }

    static getCellsTemplate (colCount, heading) {
      return Array(colCount).fill().map(_ => {
        return {
          type: 'table-cell',
          heading
        }
      })
    }

    static get refType () {
      return 'table'
    }
  }

  Table.schema = {
    type: 'table',
    rows: substance.CHILDREN('table-row')
  };

  function _shadowSpanned (matrix, row, col, rowspan, colspan, masterCell) {
    if (!rowspan && !colspan) return
    for (let i = row; i <= row + rowspan - 1; i++) {
      for (let j = col; j <= col + colspan - 1; j++) {
        if (i === row && j === col) continue
        let cell = matrix[i][j];
        cell.shadowed = true;
        cell.masterCell = masterCell;
      }
    }
  }

  function createTableSelection (tableId, data, surfaceId) {
    if (!data.anchorCellId || !data.focusCellId) throw new Error('Invalid selection data')
    return {
      type: 'custom',
      customType: 'table',
      nodeId: tableId,
      data: data,
      surfaceId
    }
  }

  function getSelectionData (sel) {
    if (sel && sel.customType === 'table') {
      return sel.data
    }
    return {}
  }

  function getSelectedRange (table, selData) {
    return getCellRange(table, selData.anchorCellId, selData.focusCellId)
  }

  function computeSelectionRectangle (ulRect, lrRect) {
    let selRect = {};
    selRect.top = ulRect.top;
    selRect.left = ulRect.left;
    selRect.width = lrRect.left + lrRect.width - selRect.left;
    selRect.height = lrRect.top + lrRect.height - selRect.top;
    return selRect
  }

  function getCellRange (table, anchorCellId, focusCellId) {
    let anchorCell = table.get(anchorCellId);
    let focusCell = table.get(focusCellId);
    let startRow = Math.min(anchorCell.rowIdx, focusCell.rowIdx);
    let startCol = Math.min(anchorCell.colIdx, focusCell.colIdx);
    let endRow = Math.max(anchorCell.rowIdx + anchorCell.rowspan - 1, focusCell.rowIdx + focusCell.rowspan - 1);
    let endCol = Math.max(anchorCell.colIdx + anchorCell.colspan - 1, focusCell.colIdx + focusCell.colspan - 1);
    return { startRow, startCol, endRow, endCol }
  }

  function computeUpdatedSelection (table, selData, dr, dc, expand) {
    let focusCellId = selData.focusCellId;
    let focusCell = table.get(focusCellId);
    let rowIdx = focusCell.rowIdx;
    let colIdx = focusCell.colIdx;
    let rowspan = focusCell.rowspan;
    let colspan = focusCell.colspan;
    let newFocusCell;
    if (dr) {
      if (dr < 0) {
        newFocusCell = table.getCell(rowIdx + dr, colIdx);
      } else if (dr > 0) {
        newFocusCell = table.getCell(rowIdx + rowspan - 1 + dr, colIdx);
      }
    } else if (dc) {
      if (dc < 0) {
        newFocusCell = table.getCell(rowIdx, colIdx + dc);
      } else if (dc > 0) {
        newFocusCell = table.getCell(rowIdx, colIdx + colspan - 1 + dc);
      }
    }
    if (newFocusCell) {
      if (newFocusCell.shadowed) newFocusCell = newFocusCell.masterCell;
      let newFocusCellId = newFocusCell.id;
      let newAnchorCellId = selData.anchorCellId;
      if (!expand) {
        newAnchorCellId = newFocusCellId;
      }
      return {
        anchorCellId: newAnchorCellId,
        focusCellId: newFocusCellId
      }
    } else {
      return selData
    }
  }

  function generateTable (doc, nrows, ncols, tableId) {
    return substance.documentHelpers.createNodeFromJson(doc, Table.getTemplate({
      id: tableId,
      headerRows: 1,
      rows: nrows,
      cols: ncols
    }))
  }

  function createTableFromTabularData (doc, data, tableId) {
    return substance.documentHelpers.createNodeFromJson(doc, {
      id: tableId,
      type: 'table',
      rows: data.map(rowData => {
        return {
          type: 'table-row',
          cells: rowData.map(cellValue => {
            return {
              type: 'table-cell',
              content: String(cellValue)
            }
          })
        }
      })
    })
  }

  const { getRangeFromMatrix } = substance.tableHelpers;

  var tableHelpers = /*#__PURE__*/Object.freeze({
    createTableSelection: createTableSelection,
    getSelectionData: getSelectionData,
    getSelectedRange: getSelectedRange,
    computeSelectionRectangle: computeSelectionRectangle,
    getCellRange: getCellRange,
    computeUpdatedSelection: computeUpdatedSelection,
    generateTable: generateTable,
    createTableFromTabularData: createTableFromTabularData,
    getRangeFromMatrix: getRangeFromMatrix
  });

  class Abstract extends substance.DocumentNode {}

  Abstract.schema = {
    type: 'abstract',
    content: substance.CONTAINER({
      nodeTypes: ['paragraph', 'heading'],
      defaultTextType: 'paragraph'
    })
  };

  class Affiliation extends substance.DocumentNode {
    toString () {
      return this.render().join('')
    }

    render (options = {}) {
      let { institution, division1, division2, division3 } = this;
      let result = institution ? [ institution ] : '???';
      // TODO: do we really want this? Because the divisions might
      // be necessary to really understand the displayed name
      if (!options.short && institution) {
        if (division1) {
          result.push(', ', division1);
        }
        if (division2) {
          result.push(', ', division2);
        }
        if (division3) {
          result.push(', ', division3);
        }
      }
      return result
    }
  }

  Affiliation.schema = {
    type: 'affiliation',
    institution: substance.STRING,
    division1: substance.STRING,
    division2: substance.STRING,
    division3: substance.STRING,
    // Consider switching to address-line1,2,3
    street: substance.STRING,
    addressComplements: substance.STRING,
    city: substance.STRING,
    state: substance.STRING,
    postalCode: substance.STRING,
    country: substance.STRING,
    phone: substance.STRING,
    fax: substance.STRING,
    email: substance.STRING,
    uri: substance.STRING
  };

  // annotations that are simple annotations
  const RICH_TEXT_ANNOS = ['bold', 'italic', 'superscript', 'subscript'];

  const EXTENDED_FORMATTING = ['monospace', 'small-caps', 'strike-through', 'underline', 'overline'];

  const LINKS_AND_XREFS = ['xref', 'external-link'];

  const INLINE_NODES = ['inline-formula', 'inline-graphic'];

  const BLOCK_LEVEL = ['block-formula', 'block-quote', 'figure', 'heading', 'list', 'paragraph', 'preformat', 'table-figure'];

  class Article extends substance.DocumentNode {}
  Article.schema = {
    type: 'article',
    metadata: substance.CHILD('metadata'),
    title: substance.TEXT(RICH_TEXT_ANNOS),
    subTitle: substance.TEXT(RICH_TEXT_ANNOS),
    abstract: substance.CHILD('abstract'),
    customAbstracts: substance.CHILDREN('custom-abstract'),
    body: substance.CHILD('body'),
    references: substance.CHILDREN('reference'),
    footnotes: substance.CHILDREN('footnote')
  };

  // Note: this is used as a indicator class for all types of references
  class Reference extends substance.DocumentNode {
    static get refType () {
      return 'bibr'
    }
  }

  Reference.schema = {
    type: 'reference'
  };

  /*
    <element-citation publication-type="article">
      <year>2016</year>
      <pub-id pub-id-type="doi">10.1101/029983</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Bloss</surname>
          <given-names>CS</given-names>
        </name>
      </person-group>
      <source>bioRxiv</source>
      <article-title>A prospective randomized trial examining...</article-title>
    </element-citation>
  */
  class ArticleRef extends Reference {}
  ArticleRef.schema = {
    type: 'article-ref', // publication-type="article"
    title: substance.STRING, // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    editors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="editor">
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    elocationId: substance.STRING, // <elocation-id>
    doi: substance.STRING, // <pub-id pub-id-type="doi">
    pmid: substance.STRING // <pub-id pub-id-type="pmid">
  };

  class BlockFormula extends substance.DocumentNode {
    static get refType () {
      return 'disp-formula'
    }
  }

  BlockFormula.schema = {
    type: 'block-formula',
    label: substance.STRING,
    content: substance.STRING
  };

  class BlockQuote extends substance.DocumentNode {
    // used to create an empty node
    static getTemplate () {
      return {
        type: 'block-quote',
        content: [
          { type: 'paragraph' }
        ]
      }
    }
  }
  BlockQuote.schema = {
    type: 'block-quote',
    content: substance.CONTAINER('paragraph'),
    attrib: 'text'
  };

  class Body extends substance.ContainerMixin(substance.DocumentNode) {
    getContent () {
      return this.content
    }
    getContentPath () {
      return [this.id, 'content']
    }
  }
  Body.schema = {
    type: 'body',
    content: substance.CONTAINER({
      nodeTypes: ['block-formula', 'block-quote', 'figure', 'heading', 'list', 'paragraph', 'preformat', 'supplementary-file', 'table-figure'],
      defaultTextType: 'paragraph'
    })
  };

  class Annotation extends substance.PropertyAnnotation {}
  Annotation.schema = {
    type: 'annotation'
  };

  class Bold extends Annotation {}
  Bold.schema = {
    type: 'bold'
  };

  /*
    <element-citation publication-type="book">
      <publisher-loc>New York</publisher-loc>
      <publisher-name>Oxford University Press</publisher-name>
      <year>2006</year>
      <pub-id pub-id-type="isbn">978-0195301069</pub-id>
      <pub-id pub-id-type="doi">10.1093/acprof:oso/9780195301069.001.0001</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Buzsaki</surname>
          <given-names>G</given-names>
        </name>
      </person-group>
      <source>Rhythms of the Brain</source>
    </element-citation>
  */
  class BookRef extends Reference {}
  BookRef.schema = {
    type: 'book-ref',
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    editors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="editor">
    translators: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="translator">
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <source>
    volume: substance.STRING, // <volume>
    edition: substance.STRING, // <editor>
    publisherLoc: substance.STRING, // <publisher-loc>
    publisherName: substance.STRING, // <publisher-name>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    pageCount: substance.STRING, // <page-count>
    series: substance.STRING, // <series>
    doi: substance.STRING, // <pub-id pub-id-type="doi">
    isbn: substance.STRING, // <pub-id pub-id-type="isbn">
    pmid: substance.STRING // <pub-id pub-id-type="pmid">
  };

  class Break extends substance.InlineNode {}
  Break.schema = {
    type: 'break'
  };

  /*
    <element-citation publication-type="chapter">
      <day>22</day>
      <fpage>180</fpage>
      <lpage>207</lpage>
      <month>08</month>
      <publisher-loc>Sunderland, MA</publisher-loc>
      <publisher-name>Sinauer Associates</publisher-name>
      <year>1989</year>
      <pub-id pub-id-type="isbn">978-0878936588</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Coyne</surname>
          <given-names>JA</given-names>
        </name>
      </person-group>
      <person-group person-group-type="editor">
        <name>
          <surname>Otte</surname>
          <given-names>D</given-names>
        </name>
      </person-group>
      <source>Speciation and its consequences</source>
      <chapter-title>Two rules of speciation</chapter-title>
    </element-citation>
  */
  class ChapterRef extends Reference {}
  ChapterRef.schema = {
    type: 'chapter-ref',
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <chapter-title>
    containerTitle: substance.STRING, // <source>
    volume: substance.STRING, // <volume>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    editors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="editor">
    translators: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="translator">
    edition: substance.STRING, // <edition>
    publisherLoc: substance.STRING, // <publisher-loc>
    publisherName: substance.STRING, // <publisher-name>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    fpage: substance.STRING, // <fpage>
    lpage: substance.STRING, // <lpage>
    pageRange: substance.STRING, // <page-range>
    elocationId: substance.STRING, // <elocation-id>
    series: substance.STRING, // <series>
    doi: substance.STRING, // <pub-id pub-id-type="doi">
    isbn: substance.STRING, // <pub-id pub-id-type="isbn">
    pmid: substance.STRING // <pub-id pub-id-type="pmid">
  };

  /*
    <element-citation publication-type="confproc">
      <conf-name>Proceedings of the 17th Annual Meeting of International Society for Magnetic Resonance in Medicine</conf-name>
      <conf-loc>Hawaii, United States</conf-loc>
      <year>2009</year>
      <person-group person-group-type="author">
        <name>
          <surname>Leemans</surname>
          <given-names>A</given-names>
        </name>
      </person-group>
      <article-title>ExploreDTI: a graphical toolbox for processing, analyzing, and visualizing diffusion MR data</article-title>
    </element-citation>
  */
  class ConferencePaperRef extends Reference {}
  ConferencePaperRef.schema = {
    type: 'conference-paper-ref', // publication-type="confproc"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    confName: substance.STRING, // <conf-name>
    confLoc: substance.STRING, // <conf-loc>
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    fpage: substance.STRING, // <fpage>
    lpage: substance.STRING, // <lpage>
    pageRange: substance.STRING, // <page-range>
    elocationId: substance.STRING, // <elocation-id>
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class CustomAbstract extends Abstract {
    static getTemplate () {
      return {
        type: 'custom-abstract',
        content: [
          { type: 'paragraph' }
        ]
      }
    }
    render (options = {}) {
      return this.title || ''
    }
  }

  CustomAbstract.schema = {
    type: 'custom-abstract',
    abstractType: substance.ENUM(['executive-summary', 'web-summary'], { default: '' }),
    title: substance.TEXT(RICH_TEXT_ANNOS)
  };

  class MetadataField extends substance.DocumentNode {
    static getTemplate () {
      return {
        type: 'metadata-field'
      }
    }

    isEmpty () {
      return this.length === 0
    }
  }
  MetadataField.schema = {
    type: 'metadata-field',
    name: substance.STRING,
    // ATTENTION: for now a field consist only of one plain-text value
    // user may use ',' to separate values
    // later on we might opt for a structural approach
    value: substance.STRING
  };

  /*
    <element-citation publication-type="data">
      <day>01</day>
      <month>06</month>
      <year>2016</year>
      <pub-id pub-id-type="accession">GSE69545</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Allison</surname>
          <given-names>KA</given-names>
        </name>
      </person-group>
      <source>NCBI Gene Expression Omnibus</source>
      <data-title>Affinity and Dose of TCR Engagement Yield Proportional Enhancer and Gene Activity in CD4+ T Cells</data-title>
    </element-citation>
  */
  class DataPublicationRef extends Reference {}
  DataPublicationRef.schema = {
    type: 'data-publication-ref', // publication-type="data"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <data-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    accessionId: substance.STRING, // <pub-id pub-id-type="accession">
    arkId: substance.STRING, // // <pub-id pub-id-type="ark">
    archiveId: substance.STRING, // <pub-id pub-id-type="archive">
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class ExternalLink extends Annotation {
    shouldNotSplit () { return true }
  }

  ExternalLink.schema = {
    type: 'external-link',
    href: substance.STRING,
    linkType: substance.STRING
  };

  class Figure extends substance.DocumentNode {
    _initialize (...args) {
      super._initialize(...args);

      this.state = {
        currentPanelIndex: 0
      };
    }

    getCurrentPanelIndex () {
      let currentPanelIndex = 0;
      if (this.state) {
        currentPanelIndex = this.state.currentPanelIndex;
      }
      return currentPanelIndex
    }

    getPanels () {
      return this.resolve('panels')
    }

    // NOTE: we are using structure of active panel as template for new one,
    // currently we are replicating the structure of metadata fields
    getTemplateFromCurrentPanel () {
      const currentIndex = this.getCurrentPanelIndex();
      const firstPanel = this.getPanels()[currentIndex];
      return {
        metadata: firstPanel.resolve('metadata').map(metadataField => (
          { type: MetadataField.type, name: metadataField.name, value: '' }
        ))
      }
    }

    static get refType () {
      return 'fig'
    }
  }
  Figure.schema = {
    type: 'figure',
    panels: substance.CHILDREN('figure-panel')
  };

  class Graphic extends substance.DocumentNode {}
  Graphic.schema = {
    type: 'graphic',
    href: substance.STRING,
    mimeType: substance.STRING
  };

  class Xref extends substance.InlineNode {}
  Xref.schema = {
    type: 'xref',
    label: substance.STRING,
    refType: substance.STRING,
    refTargets: {
      type: ['array', 'id'],
      default: []
    }
  };

  class Paragraph extends substance.TextNode {}
  Paragraph.schema = {
    type: 'paragraph',
    content: substance.TEXT(RICH_TEXT_ANNOS.concat(EXTENDED_FORMATTING).concat(LINKS_AND_XREFS).concat(INLINE_NODES))
  };

  class SupplementaryFile extends substance.DocumentNode {
    static getTemplate () {
      return {
        type: 'supplementary-file',
        legend: [{ type: 'paragraph' }]
      }
    }

    static get refType () {
      return 'file'
    }
  }

  SupplementaryFile.schema = {
    type: 'supplementary-file',
    label: substance.STRING,
    mimetype: substance.STRING,
    href: substance.STRING,
    remote: substance.BOOLEAN,
    legend: substance.CONTAINER('paragraph')
  };

  class Permission extends substance.DocumentNode {
    isEmpty () {
      return !(this.copyrightStatement || this.copyrightYear || this.copyrightHolder || this.license || this.licenseText)
    }
  }
  Permission.schema = {
    type: 'permission',
    copyrightStatement: substance.STRING,
    copyrightYear: substance.STRING,
    copyrightHolder: substance.STRING,
    // URL to license description  used as a unique license identifier
    // FIXME: bad naming. Use url, or licenseUrl?
    license: substance.STRING,
    licenseText: substance.TEXT(RICH_TEXT_ANNOS)
  };

  class FigurePanel extends substance.DocumentNode {
    getContent () {
      const doc = this.getDocument();
      return doc.get(this.content)
    }

    static getTemplate () {
      return {
        type: 'figure-panel',
        content: {
          type: 'graphic'
        },
        legend: [{
          type: 'paragraph'
        }],
        permission: {
          type: 'permission'
        }
      }
    }
  }
  FigurePanel.schema = {
    type: 'figure-panel',
    content: substance.CHILD(Graphic.type),
    title: substance.TEXT(...RICH_TEXT_ANNOS, Xref.type),
    label: substance.STRING,
    legend: substance.CONTAINER({
      nodeTypes: [Paragraph.type, SupplementaryFile.type],
      defaultTextType: Paragraph.type
    }),
    permission: substance.CHILD(Permission.type),
    metadata: substance.CHILDREN(MetadataField.type)
  };

  class Footnote extends substance.DocumentNode {
    static getTemplate () {
      return {
        type: 'footnote',
        content: [
          { type: 'paragraph' }
        ]
      }
    }
  }
  Footnote.schema = {
    type: 'footnote',
    label: substance.PLAIN_TEXT,
    content: substance.CONTAINER('paragraph')
  };

  class Funder extends substance.DocumentNode {
    toString () {
      return this.render().join('')
    }

    render (options = {}) {
      let { awardId, institution } = this;
      let result = [ institution ];
      if (!options.short) {
        if (awardId) {
          result.push(', ', awardId);
        }
      }
      return result
    }
  }
  Funder.schema = {
    type: 'funder',
    institution: substance.STRING,
    fundRefId: substance.STRING,
    awardId: substance.STRING
  };

  class Group extends substance.DocumentNode {
    toString () {
      return this.render().join('')
    }

    render (options = {}) {
      let { name } = this;
      return [ name ]
    }
  }
  Group.schema = {
    type: 'group',
    name: substance.STRING,
    email: substance.STRING,
    affiliations: substance.MANY('affiliation'),
    funders: substance.MANY('funder'),
    equalContrib: substance.BOOLEAN,
    corresp: substance.BOOLEAN
  };

  const MIN_LEVEL = 1;
  const MAX_LEVEL = 3;

  class Heading extends substance.TextNode {
    get canIndent () { return true }

    indent () {
      let level = this.level;
      if (level < MAX_LEVEL) {
        this.level = this.level + 1;
      }
    }

    get canDedent () { return true }

    dedent () {
      let level = this.level;
      if (level > MIN_LEVEL) {
        this.level = this.level - 1;
      }
    }

    static get MIN_LEVEL () { return MIN_LEVEL }

    static get MAX_LEVEL () { return MAX_LEVEL }
  }

  Heading.schema = {
    type: 'heading',
    level: { type: 'number', default: 1 },
    content: substance.TEXT(RICH_TEXT_ANNOS.concat(EXTENDED_FORMATTING).concat(LINKS_AND_XREFS).concat(INLINE_NODES).concat(['break']))
  };

  class InlineFormula extends substance.InlineNode {}
  InlineFormula.schema = {
    type: 'inline-formula',
    content: substance.STRING
  };

  class InlineGraphic extends substance.InlineNode {}
  InlineGraphic.schema = {
    type: 'inline-graphic',
    mimeType: substance.STRING,
    href: substance.STRING
  };

  class Italic extends Annotation {}
  Italic.schema = {
    type: 'italic'
  };

  /*
    <element-citation publication-type="journal">
      <day>06</day>
      <fpage>1141</fpage>
      <lpage>1144</lpage>
      <month>11</month>
      <volume>282</volume>
      <year>1998</year>
      <pub-id pub-id-type="doi">10.1126/science.282.5391.1141</pub-id>
      <pub-id pub-id-type="pmid">9804555</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Baukrowitz</surname>
          <given-names>T</given-names>
        </name>
      </person-group>
      <source>Science</source>
      <article-title>PIP<sub id="sub-1">2</sub> and PIP as determinants ...</article-title>
    </element-citation>
  */
  class JournalArticleRef extends Reference {}
  JournalArticleRef.schema = {
    type: 'journal-article-ref', // publication-type="journal"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    editors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="editor">
    containerTitle: substance.STRING, // <source>: label this 'Journal' or 'Publication' as in Zotero?
    volume: substance.STRING, // <volume>
    issue: substance.STRING, // <issue>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    fpage: substance.STRING, // <fpage>
    lpage: substance.STRING, // <lpage>
    pageRange: substance.STRING, // <page-range>
    elocationId: substance.STRING, // <elocation-id>
    doi: substance.STRING, // <pub-id pub-id-type="doi">
    pmid: substance.STRING // <pub-id pub-id-type="pmid">
  };

  class Keyword extends substance.DocumentNode {
    // not used
    // toString () {
    //   return this.render().join('')
    // }

    render (options = {}) {
      let { category, name } = this;
      let result = [ name ];
      if (!options.short) {
        if (category) {
          result.push(', ', category);
        }
      }
      return result
    }
  }

  Keyword.schema = {
    type: 'keyword',
    name: substance.TEXT(...RICH_TEXT_ANNOS),
    category: substance.STRING
  };

  class List extends substance.ListMixin(substance.DocumentNode) {
    createListItem (text) {
      let item = this.getDocument().create({ type: 'list-item', content: text, level: 1 });
      return item
    }

    getItems () {
      return substance.documentHelpers.getNodesForIds(this.getDocument(), this.items)
    }

    getItemsPath () {
      return [this.id, 'items']
    }

    getItemAt (idx) {
      let doc = this.getDocument();
      return doc.get(this.items[idx])
    }

    getItemPosition (item) {
      return this.items.indexOf(item.id)
    }

    insertItemAt (pos, item) {
      substance.documentHelpers.insertAt(this.getDocument(), this.getItemsPath(), pos, item.id);
    }

    removeItemAt (pos) {
      substance.documentHelpers.removeAt(this.getDocument(), this.getItemsPath(), pos);
    }

    getLength () {
      return this.items.length
    }

    getListTypeString () {
      return this.listType
    }

    setListTypeString (listTypeStr) {
      this.listType = listTypeStr;
    }

    _itemsChanged () {
      // HACK: using a pseudo-change triggered by items when e.g. level changes
      // TODO: find a better way for this.
      this.getDocument().set([this.id, '_itemsChanged'], true);
    }
  }

  List.schema = {
    type: 'list',
    items: substance.CHILDREN('list-item'),
    listType: substance.STRING
  };

  const MIN_LEVEL$1 = 1;
  const MAX_LEVEL$1 = 3;

  class ListItem extends substance.TextNodeMixin(substance.DocumentNode) {
    getLevel () {
      return this.level
    }

    setLevel (newLevel) {
      let doc = this.getDocument();
      doc.set([this.id, 'level'], newLevel);
    }

    getPath () {
      return [this.id, 'content']
    }

    get canIndent () { return true }

    indent () {
      let level = this.level;
      if (level < MAX_LEVEL$1) {
        this._changeLevel(1);
      }
    }

    get canDedent () { return true }

    dedent () {
      let level = this.level;
      if (level > MIN_LEVEL$1) {
        this._changeLevel(-1);
      }
    }

    _changeLevel (delta) {
      this.setLevel(this.level + delta);
      // HACK: triggering parent explicitly
      // TODO: find a better solution
      this.getParent()._itemsChanged();
    }

    static isListItem () {
      return true
    }
  }

  ListItem.schema = {
    type: 'list-item',
    level: { type: 'number', default: 1 },
    content: substance.TEXT(RICH_TEXT_ANNOS.concat(EXTENDED_FORMATTING).concat(LINKS_AND_XREFS).concat(INLINE_NODES))
  };

  /*
    <element-citation publication-type="magazine">
      <person-group person-group-type="author">
        <name>
          <surname>Craig</surname>
          <given-names>DJ</given-names>
        </name>
      </person-group>
      <year>2017</year>
      <article-title>A voice for women and girls</article-title>
      <source>Columbia Magazine</source>
      <volume>Fall 2017</volume>
      <fpage>36</fpage>
      <lpage>38</lpage>
    </element-citation>
  */
  class MagazineArticleRef extends Reference {}
  MagazineArticleRef.schema = {
    type: 'magazine-article-ref',
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <month>
    volume: substance.STRING, // <volume>
    fpage: substance.STRING, // <fpage>
    lpage: substance.STRING, // <lpage>
    pageRange: substance.STRING, // <page-range>
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class Metadata extends substance.DocumentNode {}
  Metadata.schema = {
    type: 'metadata',
    articleType: substance.STRING,
    authors: substance.CHILDREN('person'),
    editors: substance.CHILDREN('person'),
    groups: substance.CHILDREN('group'),
    affiliations: substance.CHILDREN('affiliation'),
    funders: substance.CHILDREN('funder'),
    // TODO: this might change in a similar way as we gonna approach Figure metadata, where there can be multiple fields with multiple values
    keywords: substance.CHILDREN('keyword'),
    subjects: substance.CHILDREN('subject'),
    volume: substance.STRING,
    issue: substance.STRING,
    issueTitle: substance.TEXT(...RICH_TEXT_ANNOS),
    fpage: substance.STRING,
    lpage: substance.STRING,
    pageRange: substance.STRING,
    elocationId: substance.STRING,
    acceptedDate: substance.STRING,
    publishedDate: substance.STRING,
    receivedDate: substance.STRING,
    revReceivedDate: substance.STRING,
    revRequestedDate: substance.STRING,
    permission: substance.CHILD('permission')
  };

  class Monoscript extends Annotation {}
  Monoscript.schema = {
    type: 'monospace'
  };

  /*
    <element-citation publication-type="newspaper">
      <day>27</day>
      <edition>International Edition</edition>
      <fpage>21</fpage>
      <month>4</month>
      <part-title>Film</part-title>
      <year>2018</year>
      <person-group person-group-type="author">
        <name>
          <surname>Rose</surname>
          <given-names>Steve</given-names>
        </name>
      </person-group>
      <source>The Guardian</source>
      <article-title>What if superheroes aren’t really the good guys?</article-title>
    </element-citation>
  */
  class NewspaperArticleRef extends Reference {}
  NewspaperArticleRef.schema = {
    type: 'newspaper-article-ref', // publication-type="newspaper"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    volume: substance.STRING, // <volume>
    fpage: substance.STRING, // <fpage>
    lpage: substance.STRING, // <lpage>
    pageRange: substance.STRING, // <page-range>
    doi: substance.STRING, // <pub-id pub-id-type="doi">
    edition: substance.STRING, // <edition>
    partTitle: substance.STRING // <part-title>
  };

  class Overline extends Annotation {}
  Overline.schema = {
    type: 'overline'
  };

  /*
    <element-citation publication-type="patent">
      <day>17</day>
      <month>03</month>
      <patent country="United States">US20100941530</patent>
      <year>2011</year>
      <person-group person-group-type="inventor">
        <name>
          <surname>Patterson</surname>
          <given-names>JB</given-names>
        </name>
      </person-group>
      <source>United States patent</source>
      <article-title>IRE-1alpha inhibitors</article-title>
    </element-citation>
  */
  class PatentRef extends Reference {}
  PatentRef.schema = {
    type: 'patent-ref', // publication-type="patent"
    inventors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="inventor">
    assignee: substance.STRING, // <collab collab-type="assignee"><named-content>
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    containerTitle: substance.STRING, // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    patentNumber: substance.STRING, // <patent>US20100941530</patent>
    patentCountry: substance.STRING, // <patent country="United States"></patent>
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  const extractInitials = givenNames => {
    return givenNames.split(' ').map(part => {
      return part[0] ? part[0].toUpperCase() : ''
    }).join('')
  };

  class Person extends substance.DocumentNode {
    // not used
    // toString () {
    //   return this.render().join('')
    // }

    render (options = {}) {
      let { prefix, suffix, givenNames, surname } = this;
      if (options.short) {
        givenNames = extractInitials(givenNames);
      }
      let result = [];
      if (prefix) {
        result.push(prefix, ' ');
      }
      result.push(
        givenNames,
        ' ',
        surname
      );
      if (suffix) {
        result.push(' (', suffix, ')');
      }
      return result
    }
  }
  Person.schema = {
    type: 'person',
    surname: substance.STRING,
    givenNames: substance.STRING,
    alias: substance.STRING,
    prefix: substance.STRING,
    suffix: substance.STRING,
    email: substance.STRING,
    orcid: substance.STRING,
    group: substance.ONE('group'),
    affiliations: substance.MANY('affiliation'),
    funders: substance.MANY('funder'),
    bio: substance.CHILDREN('paragraph'),
    equalContrib: substance.BOOLEAN,
    corresp: substance.BOOLEAN,
    deceased: substance.BOOLEAN
  };

  class Preformat extends substance.TextNode {}
  Preformat.schema = {
    type: 'preformat',
    content: substance.STRING,
    preformatType: substance.STRING
  };

  /* Holds data for persons and instituions/groups in references */
  class RefContrib extends substance.DocumentNode {
    // not used
    // toString () {
    //   return this.render().join('')
    // }

    render (options = {}) {
      let { givenNames, name } = this;

      let result = [
        name
      ];

      if (givenNames) {
        if (options.short) {
          givenNames = extractInitials(givenNames);
        }

        result.push(
          ' ',
          givenNames
        );
      }
      return result
    }
  }

  RefContrib.schema = {
    type: 'ref-contrib',
    name: substance.STRING, // either family name or institution name
    givenNames: substance.STRING
  };

  /*
    <element-citation publication-type="report">
      <month>06</month>
      <publisher-loc>Monrovia, Liberia</publisher-loc>
      <publisher-name>NMCP, LISGIS, and ICF International</publisher-name>
      <year>2012</year>
      <person-group person-group-type="author">
        <collab>
          <named-content content-type="name">National Malaria Control Program - Ministry of Health and Social Welfare</named-content>
        </collab>
      </person-group>
      <person-group person-group-type="sponsor">
        <collab>
          <named-content content-type="name">United States Agency for International Development</named-content>
        </collab>
      </person-group>
      <source>Liberia Malaria Indicator Survey 2011</source>
    </element-citation>
  */
  class ReportRef extends Reference {}
  ReportRef.schema = {
    type: 'report-ref', // publication-type="report"
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    sponsors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="sponsor">
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <source>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    publisherName: substance.STRING, // <publisher-name>
    publisherLoc: substance.STRING, // <publisher-loc>
    series: substance.STRING, // <series>
    isbn: substance.STRING, // <pub-id pub-id-type="isbn">
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class SmallCaps extends Annotation {}
  SmallCaps.schema = {
    type: 'small-caps'
  };

  /*
    <element-citation publication-type="software">
      <day>19</day>
      <month>3</month>
      <publisher-name>Zenodo</publisher-name>
      <version>2.0.1</version>
      <year>2018</year>
      <pub-id pub-id-type="doi">10.5281/zenodo.1203712</pub-id>
      <person-group person-group-type="author">
        <name>
          <surname>Willner</surname>
          <given-names>Sven</given-names>
        </name>
        <name>
          <surname>Gieseke</surname>
          <given-names>Robert</given-names>
        </name>
      </person-group>
      <source>pyhector</source>
    </element-citation>
  */
  class SoftwareRef extends Reference {}
  SoftwareRef.schema = {
    type: 'software-ref', // publication-type="software"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <source>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    version: substance.STRING, // <version>
    publisherLoc: substance.STRING, // <publisher-loc>
    publisherName: substance.STRING, // <publisher-name>
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class StrikeThrough extends Annotation {}
  StrikeThrough.schema = {
    type: 'strike-through'
  };

  class Subject extends substance.DocumentNode {
    // not used
    // toString () {
    //   return this.render().join('')
    // }

    render (options = {}) {
      let { category, name } = this;
      let result = [ name ];
      if (!options.short) {
        if (category) {
          result.push(', ', category);
        }
      }
      return result
    }
  }
  Subject.schema = {
    type: 'subject',
    name: substance.STRING,
    category: substance.STRING
  };

  class Subscript extends Annotation {}
  Subscript.schema = {
    type: 'subscript'
  };

  class Superscript extends Annotation {}
  Superscript.schema = {
    type: 'superscript'
  };

  class TableCell extends substance.TextNode {
    constructor (...args) {
      super(...args);

      this.rowIdx = -1;
      this.colIdx = -1;
    }

    isShadowed () {
      return this.shadowed
    }

    getMasterCell () {
      return this.masterCell
    }
  }

  TableCell.schema = {
    type: 'table-cell',
    rowspan: { type: 'number', default: 1 },
    colspan: { type: 'number', default: 1 },
    heading: { type: 'boolean', default: false },
    content: substance.TEXT('bold', 'italic', 'superscript', 'subscript', 'monospace', 'external-link', 'xref', 'inline-formula', 'inline-graphic')
  };

  class TableFigure extends FigurePanel {
    // HACK: we need a place to store the tableFootnoteManager
    // in a controlled fashion
    getFootnoteManager () {
      return this._tableFootnoteManager
    }

    setFootnoteManager (footnoteManager) {
      this._tableFootnoteManager = footnoteManager;
    }

    hasFootnotes () {
      return this.footnotes && this.footnotes.length > 0
    }

    static getTemplate (options = {}) {
      return {
        type: 'table-figure',
        content: Table.getTemplate(options),
        legend: [{ type: 'paragraph' }],
        permission: { type: 'permission' }
      }
    }
  }
  TableFigure.schema = {
    type: 'table-figure',
    content: substance.CHILD('table'),
    footnotes: substance.CHILDREN('footnote')
  };

  class TableRow extends substance.DocumentNode {
    getCells () {
      return this.resolve('cells')
    }
  }
  TableRow.schema = {
    type: 'table-row',
    cells: substance.CHILDREN('table-cell')
  };

  /*
    <element-citation publication-type="thesis">
      <publisher-loc>Nijmegen, The Netherlands</publisher-loc>
      <publisher-name>Radboud University Nijmegen Medical Centre</publisher-name>
      <year>2006</year>
      <person-group person-group-type="author">
        <name>
          <surname>Schneider</surname>
          <given-names>P</given-names>
        </name>
      </person-group>
      <article-title>PhD thesis: Submicroscopic <italic id="italic-2">Plasmodium falciparum</italic> gametocytaemia and the contribution to malaria transmission</article-title>
    </element-citation>
  */
  class ThesisRef extends Reference {}
  ThesisRef.schema = {
    type: 'thesis-ref', // publication-type="thesis"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    publisherLoc: substance.STRING, // <publisher-loc>
    publisherName: substance.STRING, // <publisher-name>
    doi: substance.STRING // <pub-id pub-id-type="doi">
  };

  class Underline extends Annotation {}
  Underline.schema = {
    type: 'underline'
  };

  class UnsupportedInlineNode extends substance.InlineNode {}
  UnsupportedInlineNode.schema = {
    type: 'unsupported-inline-node',
    data: 'string'
  };

  class UnsupportedNode extends substance.DocumentNode {}
  UnsupportedNode.schema = {
    type: 'unsupported-node',
    data: substance.STRING
  };

  /*
    <element-citation publication-type="webpage">
      <day>10</day>
      <month>05</month>
      <uri>http://www.michaeleisen.org/blog/?p=1894</uri>
      <date-in-citation iso-8601-date="1995-09-10">1995-09-10</date-in-citation>
      <year>2016</year>
      <person-group person-group-type="author">
        <name>
          <surname>Eisen</surname>
          <given-names>M</given-names>
        </name>
      </person-group>
      <source>it is NOT junk</source>
      <article-title>The Imprinter of All Maladies</article-title>
    </element-citation>
  */
  class WebpageRef extends Reference {}
  WebpageRef.schema = {
    type: 'webpage-ref', // publication-type="webpage"
    title: substance.TEXT(...RICH_TEXT_ANNOS), // <article-title>
    // E.g. website name, where the page appeared
    containerTitle: substance.STRING, // <source>
    authors: substance.CHILDREN('ref-contrib'), // <person-group person-group-type="author">
    year: substance.STRING, // <year>
    month: substance.STRING, // <month>
    day: substance.STRING, // <day>
    accessedDate: substance.STRING, // <date-in-citation iso-8601-date="1995-09-10">
    uri: substance.STRING // <uri>
  };

  class TableEditingAPI {
    constructor (editorSession) {
      this.editorSession = editorSession;
    }

    isTableSelected () {
      let sel = this._getSelection();
      return (sel && !sel.isNull() && sel.customType === 'table')
    }

    deleteSelection () {
      if (!this.isTableSelected()) throw new Error('Table selection required')
      let selData = this._getSelectionData();
      let { tableId, startRow, endRow, startCol, endCol } = selData;
      this.editorSession.transaction(tx => {
        // Note: the selection remains the same
        this._clearValues(tx.get(tableId), startRow, startCol, endRow, endCol);
      }, { action: 'deleteSelection' });
    }

    copySelection () {
      if (!this.isTableSelected()) throw new Error('Table selection required')

      // create a snippet with a table containing only the selected range
      let selData = this._getSelectionData();
      let { table, startRow, endRow, startCol, endCol } = selData;
      let doc = this._getDocument();
      let matrix = getRangeFromMatrix(table.getCellMatrix(), startRow, startCol, endRow, endCol, true);
      let snippet = doc.createSnippet();
      let tableData = { type: 'table', rows: [] };
      for (let row of matrix) {
        let rowData = { type: 'table-row', cells: [] };
        for (let cell of row) {
          let ids = substance.documentHelpers.copyNode(cell).map(_node => snippet.create(_node).id);
          let cellId = ids[0];
          console.assert(cellId, 'cellId should not be nil');
          rowData.cells.push(ids[0]);
        }
        tableData.rows.push(snippet.create(rowData).id);
      }
      let tableCopy = snippet.create(tableData);
      snippet.getContainer().append(tableCopy.id);
      return snippet
    }

    cut () {
      let snippet = this.copySelection();
      this.deleteSelection();
      return snippet
    }

    paste (content, options) {
      if (!this.isTableSelected()) throw new Error('Table selection required')

      // TODO: implement paste for tables
      let snippet = content.get(substance.documentHelpers.SNIPPET_ID);
      if (!snippet) return false
      let first = snippet.getNodeAt(0);
      if (first.type !== 'table') return false
      return this._pasteTable(first)
    }

    _pasteTable (copy) {
      // TODO: extend dimension if necessary
      // and the assign cell attributes and content
      // ATTENTION: make sure that col/rowspans do not extend the table dims
      let [nrows, ncols] = copy.getDimensions();
      let selData = this._getSelectionData();
      let { tableId, startRow, startCol } = selData;
      let N = startRow + nrows;
      let M = startCol + ncols;
      // make the table larger if necessary
      this._ensureSize(tableId, N, M);

      this.editorSession.transaction(tx => {
        let table = tx.get(tableId);
        let cellMatrix = table.getCellMatrix();
        let copyCellMatrix = copy.getCellMatrix();
        for (let rowIdx = 0; rowIdx < nrows; rowIdx++) {
          for (let colIdx = 0; colIdx < ncols; colIdx++) {
            let copyCell = copyCellMatrix[rowIdx][colIdx];
            let cell = cellMatrix[startRow + rowIdx][startCol + colIdx];
            // TODO: copy annotations too
            let data = copyCell.toJSON();
            delete data.id;
            delete data.type;
            cell.assign(data);
          }
        }
      }, { action: 'paste' });

      return true
    }

    insertRows (mode, count) {
      if (!this.isTableSelected()) return

      let selData = this._getSelectionData();
      let tableId = selData.tableId;
      let pos = mode === 'below' ? selData.endRow + 1 : selData.startRow;
      this.editorSession.transaction(tx => {
        this._createRowsAt(tx.get(tableId), pos, count);
      }, { action: 'insertRows', pos, count });
    }

    insertCols (mode, count) {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      let tableId = selData.tableId;
      let pos = mode === 'right' ? selData.endCol + 1 : selData.startCol;
      this.editorSession.transaction(tx => {
        this._createColumnsAt(tx.get(tableId), pos, count);
      }, { action: 'insertCols', pos, count });
    }

    deleteRows () {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      let tableId = selData.tableId;
      let pos = selData.startRow;
      let count = selData.nrows;
      this.editorSession.transaction(tx => {
        this._deleteRows(tx.get(tableId), pos, count);
        tx.selection = null;
      }, { action: 'deleteRows', pos, count });
    }

    deleteCols () {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      let tableId = selData.tableId;
      let pos = selData.startCol;
      let count = selData.ncols;
      this.editorSession.transaction(tx => {
        this._deleteCols(tx.get(tableId), pos, pos + count - 1);
        tx.selection = null;
      }, { action: 'deleteCols', pos, count });
    }

    merge () {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      // TODO: make sure that the selection allows to do that
      const tableId = selData.tableId;
      let table = this._getDocument().get(tableId);
      let { startRow, endRow, startCol, endCol } = selData;
      let bigOne = table.getCell(startRow, startCol);
      // compute the span by walking all non-shadowed cells
      for (let i = startRow; i <= endRow; i++) {
        for (let j = startCol; j <= endCol; j++) {
          let cell = table.getCell(i, j);
          if (cell.shadowed) continue
          let rowspan = cell.rowspan;
          let colspan = cell.colspan;
          if (rowspan > 1) {
            endRow = Math.max(endRow, i + rowspan - 1);
          }
          if (colspan > 1) {
            endCol = Math.max(endCol, j + colspan - 1);
          }
        }
      }
      // Note: spans should be >= 1, i.e. rowspan=1 means no spanning
      let rowspan = endRow - startRow + 1;
      let colspan = endCol - startCol + 1;
      if (bigOne.rowspan !== rowspan || bigOne.colspan !== colspan) {
        this.editorSession.transaction(tx => {
          let cell = tx.get(bigOne.id);
          cell.rowspan = rowspan;
          cell.colspan = colspan;
          tx.selection = createTableSelection(tableId, {
            anchorCellId: cell.id,
            focusCellId: cell.id
          }, selData.surfaceId);
        }, { action: 'mergeCells' });
      }
    }

    unmerge () {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      // TODO: make sure that the selection allows to do that
      const tableId = selData.tableId;
      let table = this._getDocument().get(tableId);
      let [N, M] = table.getDimensions();
      let { startRow, startCol, endRow, endCol } = selData;
      let cellIds = [];
      // index of focus cell after unmerging
      let newFocusRow = 0;
      let newFocusCol = 0;
      const _updateFocus = (row, col) => {
        newFocusRow = Math.min(N, Math.max(row, newFocusRow));
        newFocusCol = Math.min(M, Math.max(col, newFocusCol));
      };
      for (let i = startRow; i <= endRow; i++) {
        for (let j = startCol; j <= endCol; j++) {
          let cell = table.getCell(i, j);
          // TODO: do not umerge shadowed cells
          let rowspan = cell.rowspan;
          let colspan = cell.colspan;
          if (rowspan > 1 || colspan > 1) {
            _updateFocus(i + rowspan - 1, j + colspan - 1);
            cellIds.push(cell.id);
          }
        }
      }
      // TODO: selData is a little bit confusing
      // at other places selData is used for the 'data' part of the CustomSelection
      let newAnchorCell = selData.anchorCell;
      let newFocusCell = table.getCell(newFocusRow, newFocusCol);
      if (cellIds.length > 0) {
        this.editorSession.transaction(tx => {
          for (let id of cellIds) {
            let cell = tx.get(id);
            cell.rowspan = 1;
            cell.colspan = 1;
          }
          tx.selection = createTableSelection(tableId, {
            anchorCellId: newAnchorCell.id,
            focusCellId: newFocusCell.id
          });
        }, { action: 'unmergeCells' });
      }
    }

    toggleHeading (cellIds) {
      if (cellIds && cellIds.length > 0) {
        this.editorSession.transaction(tx => {
          for (let id of cellIds) {
            let cell = tx.get(id);
            cell.heading = !cell.heading;
          }
        }, { action: 'toggleHeading' });
      }
    }

    insertText (newVal) {
      if (!this.isTableSelected()) return
      let selData = this._getSelectionData();
      let cellId = selData.anchorCell.id;
      this.editorSession.transaction(tx => {
        let cell = tx.get(cellId);
        let path = cell.getPath();
        cell.setText(newVal);
        tx.setSelection({
          type: 'property',
          path,
          startOffset: newVal.length,
          surfaceId: selData.surfaceId + '/' + substance.getKeyForPath(path)
        });
      }, { action: 'insertText' });
    }

    insertSoftBreak () {
      this.editorSession.transaction(tx => {
        tx.insertText('\n');
      }, { action: 'soft-break' });
    }

    _getDocument () {
      return this.editorSession.getDocument()
    }

    _getSelection () {
      return this.editorSession.getSelection()
    }

    _getSelectionData () {
      let doc = this._getDocument();
      let sel = this._getSelection();
      if (sel && sel.customType === 'table') {
        let nodeId = sel.nodeId;
        let { anchorCellId, focusCellId } = sel.data;
        let table = doc.get(nodeId);
        let anchorCell = doc.get(anchorCellId);
        let focusCell = doc.get(focusCellId);
        let { startRow, startCol, endRow, endCol } = getCellRange(table, anchorCellId, focusCellId);
        return {
          table,
          tableId: table.id,
          anchorCell,
          focusCell,
          startRow,
          endRow,
          startCol,
          endCol,
          nrows: endRow - startRow + 1,
          ncols: endCol - startCol + 1,
          surfaceId: sel.surfaceId
        }
      }
    }

    _getTable (doc, sel) {
      if (!sel || sel.isNull() || sel.customType === 'table') {
        return null
      }
    }

    _createRowsAt (table, rowIdx, n) {
      let doc = table.getDocument();
      let M = table.getColumnCount();
      const path = [table.id, 'rows'];
      let rowIds = Table.getRowsTemplate(n, M).map(data => substance.documentHelpers.createNodeFromJson(doc, data).id);
      for (let i = 0; i < n; i++) {
        substance.documentHelpers.insertAt(doc, path, rowIdx + i, rowIds[i]);
      }
    }

    _deleteRows (table, startRow, endRow) {
      let doc = table.getDocument();
      const path = [table.id, 'rows'];
      for (let rowIdx = endRow; rowIdx >= startRow; rowIdx--) {
        let id = substance.documentHelpers.removeAt(doc, path, rowIdx);
        substance.documentHelpers.deepDeleteNode(table.getDocument(), id);
      }
    }

    _deleteCols (table, startCol, endCol) {
      let doc = table.getDocument();
      let N = table.getRowCount();
      for (let rowIdx = N - 1; rowIdx >= 0; rowIdx--) {
        let row = table.getRowAt(rowIdx);
        let path = [row.id, 'cells'];
        for (let colIdx = endCol; colIdx >= startCol; colIdx--) {
          let id = substance.documentHelpers.removeAt(doc, path, colIdx);
          substance.documentHelpers.deepDeleteNode(table.getDocument(), id);
        }
      }
    }

    _createColumnsAt (table, colIdx, n) {
      let doc = table.getDocument();
      let rows = table.resolve('rows');
      for (let row of rows) {
        let path = [row.id, 'cells'];
        let cellIds = Table.getCellsTemplate(n).map(data => substance.documentHelpers.createNodeFromJson(doc, data).id);
        for (let i = 0; i < n; i++) {
          substance.documentHelpers.insertAt(doc, path, colIdx + i, cellIds[i]);
        }
      }
    }

    _clearValues (table, startRow, startCol, endRow, endCol) {
      let doc = table.getDocument();
      for (let rowIdx = startRow; rowIdx <= endRow; rowIdx++) {
        for (let colIdx = startCol; colIdx <= endCol; colIdx++) {
          let cell = table.getCell(rowIdx, colIdx);
          substance.documentHelpers.deleteTextRange(doc, { path: cell.getPath(), offset: 0 });
        }
      }
    }

    _ensureSize (tableId, nrows, ncols) {
      let table = this._getDocument().get(tableId);
      let [_nrows, _ncols] = table.getDimensions();
      if (_ncols < ncols) {
        let pos = _ncols;
        let count = ncols - _ncols;
        this.editorSession.transaction(tx => {
          this._createColumnsAt(tx.get(tableId), pos, count);
        }, { action: 'insertCols', pos, count });
      }
      if (_nrows < nrows) {
        let pos = _nrows;
        let count = nrows - _nrows;
        this.editorSession.transaction(tx => {
          this._createRowsAt(tx.get(tableId), pos, count);
        }, { action: 'insertRows', pos, count });
      }
    }
  }

  function importFigures (tx, sel, files, paths) {
    if (files.length === 0) return

    let containerPath = sel.containerPath;
    let figures = files.map((file, idx) => {
      let href = paths[idx];
      let mimeType = file.type;
      let panelTemplate = FigurePanel.getTemplate();
      panelTemplate.content.href = href;
      panelTemplate.content.mimeType = mimeType;
      let figure = substance.documentHelpers.createNodeFromJson(tx, {
        type: 'figure',
        panels: [ panelTemplate ]
      });
      // Note: this is necessary because tx.insertBlockNode()
      // selects the inserted node
      // TODO: maybe we should change the behavior of tx.insertBlockNode()
      // so that it is easier to insert multiple nodes in a row
      if (idx !== 0) {
        tx.break();
      }
      tx.insertBlockNode(figure);
      return figure
    });
    substance.selectionHelpers.selectNode(tx, substance.last(figures).id, containerPath);
  }

  function getLabel (node) {
    if (node._isModel) {
      node = node._node;
    }
    let label = node.label;
    if (node && node.state) {
      label = node.state.label || label;
    }
    return label
  }

  function getPos (node) {
    let pos;
    if (node && node.state) {
      pos = node.state.pos;
    }
    if (pos === undefined) {
      pos = Number.MAX_VALUE;
    }
    return pos
  }

  function findParentByType (node, type) {
    let parent = node.getParent();
    while (parent) {
      if (parent.isInstanceOf(type)) {
        return parent
      }
      parent = parent.getParent();
    }
  }

  function ifNodeOrRelatedHasChanged (node, change, cb) {
    let doc = node.getDocument();
    let id = node.id;
    let hasChanged = change.hasUpdated(id);
    if (!hasChanged) {
      let relationships = doc.getIndex('relationships');
      // TODO: this could probably be improved by only navigating updated nodes
      let ids = Object.keys(change.updated);
      for (let _id of ids) {
        let related = relationships.get(_id);
        if (related && related.has(id)) {
          hasChanged = true;
          break
        }
      }
    }
    if (hasChanged) cb();
  }

  function journalArticleRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }

    // We render an annotated article title here:
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '.'
      );
    }

    if (entity.editors.length > 0) {
      fragments = fragments.concat(
        ' ',
        _renderAuthors($$, entity.editors, entityDb),
        '.'
      );
    }
    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(entity.containerTitle),
        '.'
      );
    }

    let date = _renderDate($$, entity.year, entity.month, entity.day, 'short');
    if (date) {
      fragments.push(' ', date, ';');
    }

    if (entity.volume) {
      fragments.push(entity.volume);
    }
    if (entity.issue) {
      fragments.push('(', entity.issue, ')');
    }

    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(':', contentLocation, '.');
    } else {
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    if (entity.pmid) {
      fragments.push(' PMID ', entity.pmid);
    }
    return fragments
  }

  function bookRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    } else if (entity.editors.length > 0) {
      let editorLabel = entity.editors.length > 1 ? 'eds' : 'ed';
      fragments = fragments.concat(
        _renderAuthors($$, entity.editors, entityDb),
        ', ',
        editorLabel,
        '.'
      );
    }
    if (entity.translators.length) {
      fragments = fragments.concat(
        ' (',
        _renderAuthors($$, entity.translators, entityDb),
        ', trans).'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        $$('i').append(entity.title),
        '.'
      );
    }
    if (entity.volume) {
      if (/^\d+$/.test(entity.volume)) {
        fragments.push(' Vol ', entity.volume, '.');
      } else {
        fragments.push(' ', entity.volume, '.');
      }
    }
    if (entity.edition) {
      fragments.push(' ', entity.edition, '.');
    }
    if (entity.editors.length > 0 && entity.authors.length > 0) {
      let editorLabel = entity.editors.length > 1 ? 'eds' : 'ed';
      fragments = fragments.concat(
        ' (',
        _renderAuthors($$, entity.editors, entityDb),
        ', ',
        editorLabel,
        ').'
      );
    }

    fragments.push(_renderPublisherPlace($$, entity.publisherLoc, entity.publisherName));

    if (entity.series) {
      fragments.push(' (', entity.series, ')');
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
    }
    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(':', contentLocation, '.');
    } else {
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }
    return fragments
  }

  function chapterRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.translators.length) {
      fragments = fragments.concat(
        ' (',
        _renderAuthors($$, entity.translators, entityDb),
        ', trans).'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    fragments = fragments.concat('In: ');
    if (entity.editors.length > 0) {
      let editorLabel = entity.editors.length > 1 ? 'eds' : 'ed';
      fragments = fragments.concat(
        ' ',
        _renderAuthors($$, entity.editors, entityDb),
        ', ',
        editorLabel,
        '.'
      );
    }
    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(
          entity.containerTitle
        ),
        '.'
      );
    }
    if (entity.volume) {
      if (/^\d+$/.test(entity.volume)) {
        fragments.push(' ', entity.volume, '.');
      } else {
        fragments.push(' Vol ', entity.volume, '.');
      }
    }
    if (entity.edition) {
      fragments.push(' ', entity.edition, '.');
    }

    fragments.push(_renderPublisherPlace($$, entity.publisherLoc, entity.publisherName));

    if (entity.series) {
      fragments.push(' (', entity.series, ')');
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
    }
    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(':', contentLocation, '.');
    } else {
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }
    return fragments
  }

  function patentRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.inventors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.inventors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.assignee) {
      fragments.push(' ', entity.assignee, ',');
    }
    let date = _renderDate($$, entity.year, entity.month, entity.day, 'short');
    if (date) {
      fragments.push(' ', date, ';');
    }
    if (entity.patentNumber) {
      fragments.push(' ', entity.patentNumber);
    }
    if (entity.patentCountry) {
      fragments.push(' (', entity.patentCountry, ').');
    }
    return fragments
  }

  function articleRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    // We render an annotated article title here:
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '.'
      );
    }

    if (entity.editors.length > 0) {
      fragments = fragments.concat(
        ' ',
        _renderAuthors($$, entity.editors, entityDb),
        '.'
      );
    }
    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(entity.containerTitle),
        '.'
      );
    }

    let date = _renderDate($$, entity.year, entity.month, entity.day, 'short');
    if (date) {
      fragments.push(' ', date, ';');
    }

    if (entity.issue) {
      fragments.push('(', entity.issue, ')');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    if (entity.pmid) {
      fragments.push(' PMID ', entity.pmid);
    }
    return fragments
  }

  function dataPublicationRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(entity.containerTitle),
        '.'
      );
    }
    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
      fragments.push('.');
    }
    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }
    if (entity.arkId) {
      fragments.push(' ', entity.arkId);
    }
    if (entity.archiveId) {
      fragments.push(' ', entity.archiveId);
    }
    if (entity.accessionId) {
      fragments.push(' ', entity.accessionId);
    }
    return fragments
  }

  function magazineArticleRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(entity.containerTitle),
        ','
      );
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
    }

    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(':', contentLocation, '.');
    } else {
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    return fragments
  }

  function newspaperArticleRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.containerTitle) {
      fragments.push(
        ' ',
        $$('i').append(entity.containerTitle),
        ','
      );
      if (entity.edition) {
        fragments.push(
          ' ',
          $$('i').append(entity.edition),
          ','
        );
      }
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
    }

    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(':', contentLocation);
    }
    if (entity.partTitle) {
      fragments.push(' (', entity.partTitle, ')');
    }
    fragments.push('.');

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    return fragments
  }

  function reportRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];
    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '. '
      );
    }

    if (entity.sponsors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.sponsors, entityDb),
        ', sponsors. '
      );
    }

    if (entity.title) {
      fragments.push(
        $$('i').append(entity.title),
        '.'
      );
    }

    fragments.push(_renderPublisherPlace($$, entity.publisherLoc, entity.publisherName));

    if (entity.series) {
      fragments.push(' (', entity.series, ')');
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    return fragments
  }

  function conferencePaperRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.containerTitle) {
      fragments.push(' ', $$('i').append(entity.containerTitle), '.');
    }

    if (entity.confName && entity.confLoc) {
      fragments.push(' ', entity.confName, '; ', entity.confLoc, '.');
    } else if (entity.confName) {
      fragments.push(' ', entity.confName, '.');
    } else if (entity.confLoc) {
      fragments.push(' ', entity.confLoc, '.');
    }

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
    }

    let contentLocation = _renderLocation($$, entity.fpage, entity.lpage, entity.pageRange, entity.elocationId);
    if (contentLocation) {
      fragments.push(', ', contentLocation, '.');
    } else {
      fragments.push('.');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }
    return fragments
  }

  function softwareRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        ' ',
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '.'
      );
    }
    if (entity.version) {
      fragments.push(' Version ', entity.version);
    }
    fragments.push('.');

    fragments.push(_renderPublisherPlace($$, entity.publisherLoc, entity.publisherName));

    let date = _renderDate($$, entity.year, entity.month, entity.day, 'short');
    if (date) {
      fragments.push(' ', date, ';');
    }

    if (entity.doi) {
      fragments.push(
        ' ',
        _renderDOI($$, entity.doi)
      );
    }

    return fragments
  }

  function thesisRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    fragments.push(_renderPublisherPlace($$, entity.publisherLoc, entity.publisherName));

    if (entity.year) {
      fragments.push(' ', entity.year);
      if (entity.month) {
        fragments.push(' ', _renderMonth(entity.month, 'short'));
      }
      fragments.push('.');
    }

    return fragments
  }

  function webpageRenderer ($$, entityId, entityDb, exporter) {
    let entity = entityDb.get(entityId);
    let fragments = [];

    if (entity.authors.length > 0) {
      fragments = fragments.concat(
        _renderAuthors($$, entity.authors, entityDb),
        '.'
      );
    }
    if (entity.title) {
      fragments.push(
        ' ',
        ...exporter.annotatedText([entity.id, 'title'], entityDb, $$),
        '. '
      );
    }

    if (entity.publisherLoc) {
      fragments.push(' ', entity.publisherLoc);
    }

    if (entity.uri) {
      fragments.push(
        ' ',
        $$('a').attr({
          href: entity.uri,
          target: '_blank'
        }).append(
          entity.uri
        )
      );
    }

    if (entity.year) {
      let dateFormatted = _renderDate($$, entity.year, entity.month, entity.day, 'long');
      fragments.push('. Accessed ', dateFormatted, '.');
    }

    return fragments
  }

  function entityRenderer ($$, entityId, entityDb, options = {}) {
    let entity = entityDb.get(entityId);
    return entity.render(options)
  }

  /*
    Exports
  */
  var entityRenderers = {
    'article-ref': _delegate(articleRenderer),
    'person': _delegate(entityRenderer),
    'group': _delegate(entityRenderer),
    'book-ref': _delegate(bookRenderer),
    'chapter-ref': _delegate(chapterRenderer),
    'journal-article-ref': _delegate(journalArticleRenderer),
    'conference-paper-ref': _delegate(conferencePaperRenderer),
    'report-ref': _delegate(reportRenderer),
    'affiliation': _delegate(entityRenderer),
    'funder': _delegate(entityRenderer),
    'data-publication-ref': _delegate(dataPublicationRenderer),
    'magazine-article-ref': _delegate(magazineArticleRenderer),
    'newspaper-article-ref': _delegate(newspaperArticleRenderer),
    'software-ref': _delegate(softwareRenderer),
    'thesis-ref': _delegate(thesisRenderer),
    'webpage-ref': _delegate(webpageRenderer),
    'keyword': _delegate(entityRenderer),
    'ref-contrib': _delegate(entityRenderer),
    'patent-ref': _delegate(patentRenderer),
    'subject': _delegate(entityRenderer),
    'custom-abstract': _delegate(entityRenderer)
  };

  /*
    Helpers
  */
  function _renderAuthors ($$, authors, entityDb) {
    let fragments = [];
    authors.forEach((refContribId, i) => {
      fragments = fragments.concat(
        entityRenderer($$, refContribId, entityDb, { short: true })
      );
      if (i < authors.length - 1) {
        fragments.push(', ');
      }
    });
    return fragments
  }

  function _renderDate ($$, year, month, day, format) {
    if (year) {
      if (month) {
        if (day) {
          return year + ' ' + _renderMonth(month, format) + ' ' + day
        } else {
          return year + ' ' + _renderMonth(month, format)
        }
      } else {
        return year
      }
    }
  }

  function _renderMonth (month, format) {
    let monthNames;
    if (format === 'long') {
      monthNames = [null, 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    } else {
      monthNames = [null, 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    }
    if (month) {
      return monthNames[month] || month
    }
  }

  function _renderDOI ($$, doi) {
    return $$('a').attr({
      href: `https://doi.org/${doi}`,
      target: '_blank'
    }).append(
      'https://doi.org/',
      doi
    )
  }

  function _renderLocation ($$, fpage, lpage, pageRange, elocationId) {
    if (pageRange) {
      // Give up to three page ranges, then use passim for more, see
      // https://www.ncbi.nlm.nih.gov/books/NBK7282/box/A33679/?report=objectonly
      let parts = pageRange.split(',');
      if (parts.length > 3) {
        return parts.slice(0, 3).join(',') + ' passim'
      } else {
        return pageRange
      }
    } else if (fpage) {
      if (lpage) {
        // Do not repeat page numbers unless they are followed by a letter
        // e.g. 211-218 => 211-8 but 211A-218A stays
        if (fpage.length === lpage.length && /^\d+$/.test(fpage) && /^\d+$/.test(lpage)) {
          let i;
          for (i = 0; i < fpage.length; i++) {
            if (fpage[i] !== lpage[i]) break
          }
          return fpage + '-' + lpage.substring(i)
        }
        return fpage + '-' + lpage
      } else {
        return fpage
      }
    } else if (elocationId) {
      return elocationId
    }
  }

  function _renderPublisherPlace ($$, place, publisher) {
    if (place && publisher) {
      return ' ' + place + ': ' + publisher + '; '
    } else if (place) {
      return ' ' + place + '; '
    } else if (publisher) {
      return ' ' + publisher + '; '
    } else {
      return ''
    }
  }

  function _delegate (fn) {
    return function (entityId, db, exporter, options) {
      let el = _createElement();
      let $$ = el.createElement.bind(el);
      let fragments = fn($$, entityId, db, exporter, options);
      el.append(fragments);
      return el.innerHTML
    }
  }

  function _createElement () {
    return substance.DefaultDOMElement.parseSnippet('<div>', 'html')
  }

  // TODO: rethink this.
  // The fact that it needs an exporter makes it not very useful.
  // In general I think that these renderers should not depend on an HTML exporter
  function renderEntity (entity, exporter, options = {}) {
    if (entity) {
      const type = entity.type;
      let renderer = entityRenderers[type];
      if (renderer) {
        let doc = entity.getDocument();
        return renderer(entity.id, doc, exporter, options)
      } else {
        console.error(`No renderer available for type '${type}'`);
      }
    }
    return ''
  }

  // left side: node type
  // right side: ref-type
  const REF_TYPES = {
    'block-formula': BlockFormula.refType,
    'figure': 'fig',
    'footnote': 'fn',
    'refererence': 'bibr',
    'table-figure': 'table',
    'supplementary-file': 'file'
  };

  // left side: ref-type
  // right side: [... node types]
  const XREF_TARGET_TYPES = Object.keys(REF_TYPES).reduce((m, type) => {
    const refType = REF_TYPES[type];
    if (!m[refType]) m[refType] = [];
    m[refType].push(type);
    return m
  }, {
    'table-fn': ['footnote']
  });

  function getXrefTargets (xref) {
    return xref.refTargets
  }

  function getXrefLabel (xref) {
    return getLabel(xref)
  }

  class AbstractCitationManager {
    constructor (editorSession, refType, targetTypes, labelGenerator) {
      this.editorSession = editorSession;
      this.refType = refType;
      this.targetTypes = new Set(targetTypes);
      this.labelGenerator = labelGenerator;

      editorSession.on('change', this._onDocumentChange, this);
    }

    dispose () {
      this.editorSession.off(this);
    }

    hasCitables () {
      return this.getCitables().length > 0
    }

    getCitables () {
      return []
    }

    getSortedCitables () {
      return this.getCitables().sort((a, b) => {
        return getPos(a) - getPos(b)
      })
    }

    // TODO: how could this be generalized so that it is less dependent on the internal model?
    _onDocumentChange (change) {
      // HACK: do not react on node state updates
      if (change.info.action === 'node-state-update') return

      const ops = change.ops;
      for (var i = 0; i < ops.length; i++) {
        let op = ops[i];
        if (op.isNOP()) continue
        // 1. xref has been added or removed
        // 2. citable has been add or removed
        if (this._detectAddRemoveXref(op) || this._detectAddRemoveCitable(op, change)) {
          return this._updateLabels()
        // 3. xref targets have been changed
        // 4. refType of an xref has been changed (TODO: do we really need this?)
        } else if (this._detectChangeRefTarget(op) || this._detectChangeRefType(op)) {
          return this._updateLabels()
        }
      }
    }

    _detectAddRemoveXref (op) {
      return (op.val && op.val.type === 'xref' && op.val.refType === this.refType)
    }

    _detectAddRemoveCitable (op, change) {
      return (op.val && this.targetTypes.has(op.val.type))
    }

    _detectChangeRefTarget (op) {
      if (op.path[1] === 'refTargets') {
        let doc = this._getDocument();
        let node = doc.get(op.path[0]);
        return (node && node.refType === this.refType)
      } else {
        return false
      }
    }

    _detectChangeRefType (op) {
      return (op.path[1] === 'refType' && (op.val === this.refType || op.original === this.refType))
    }

    /*
      Label of bibliographic entries are determined
      by the order of their citations in the document.
      I.e. typically you pick all citations (`<xref>`) as they
      occur in the document, and provide the ids of the entries
      they refer to. This forms a list of tuples, such as:
      ```
        [
          { id: 'cite1', refs: [AB06, Mac10] },
          { id: 'cite2', refs: [FW15] },
          { id: 'cite3', refs: [Mac10, AB06, AB07] }
        ]
      ```

      @param {Array<Object>} a list of citation entries.
    */
    _updateLabels (silent) {
      let xrefs = this._getXrefs();
      let refs = this.getCitables();
      let refsById = refs.reduce((m, ref) => {
        m[ref.id] = ref;
        return m
      }, {});

      let stateUpdates = [];

      let pos = 1;
      let order = {};
      let refLabels = {};
      let xrefLabels = {};
      xrefs.forEach((xref) => {
        let isInvalid = false;
        let numbers = [];
        let targetIds = xref.refTargets;
        for (let id of targetIds) {
          // fail if there is an unknown id
          if (!refsById[id]) {
            isInvalid = true;
            continue
          }
          if (!order.hasOwnProperty(id)) {
            order[id] = pos;
            refLabels[id] = this.labelGenerator.getLabel(pos);
            pos++;
          }
          numbers.push(order[id]);
        }
        // invalid labels shall be the same as empty ones
        if (isInvalid) {
          // HACK: we just signal invalid references with a ?
          numbers.push('?');
          console.warn(`invalid label detected for ${xref.id}`);
        }
        xrefLabels[xref.id] = this.labelGenerator.getLabel(numbers);
      });

      // HACK
      // Now update the node state of all affected xref[ref-type='bibr']
      // TODO: solve this properly
      xrefs.forEach(xref => {
        const label = xrefLabels[xref.id];
        const state = { label };
        stateUpdates.push([xref.id, state]);
      });
      refs.forEach((ref, index) => {
        const label = refLabels[ref.id] || '';
        const state = { label };
        if (order[ref.id]) {
          state.pos = order[ref.id];
        } else {
          state.pos = pos + index;
        }
        stateUpdates.push([ref.id, state]);
      });

      // FIXME: here we also made the 'collection' dirty originally

      this.editorSession.updateNodeStates(stateUpdates, { silent });
    }

    _getDocument () {
      return this.editorSession.getDocument()
    }

    _getXrefs () {
      // TODO: is it really a good idea to tie this implementation to 'article' here?
      const article = this._getDocument().get('article');
      let refs = article.findAll(`xref[refType='${this.refType}']`);
      return refs
    }

    _getLabelGenerator () {
      return this.labelGenerator
    }
  }

  /*
    A base class for FigureManager and TableManager. In contrast to citables like references or footnotes,
    the citable content is part of the content itself, and has a fixed order defined by the occurrence in the document.
    E.g. a reference is sorted and labeled according to the order of citations, but a figure is labeled according
    to the occurence in the content.
  */
  class CitableContentManager extends AbstractCitationManager {
    hasCitables () {
      return Boolean(this._getContentElement().find(this._getItemSelector()))
    }

    getCitables () {
      return this._getContentElement().findAll(this._getItemSelector())
    }

    getSortedCitables () {
      return this.getCitables()
    }

    _getItemSelector () {
      return XREF_TARGET_TYPES[this.refType].join(',')
    }

    _getXrefs () {
      return this._getDocument().findAll(`xref[refType='${this.refType}']`)
    }

    _detectAddRemoveCitable (op, change) {
      if (op.isUpdate()) {
        const contentPath = this._getContentPath();
        if (substance.isArrayEqual(op.path, contentPath)) {
          const doc = this._getDocument();
          let id = op.diff.val;
          let node = doc.get(id) || change.hasDeleted(id);
          return (node && this.targetTypes.has(node.type))
        }
      }
      return false
    }

    _getContentPath () {
      return this._getContentElement().getContentPath()
    }

    _getContentElement () {
      return this._getDocument().get('body')
    }

    _updateLabels (silent) {
      let targetUpdates = this._computeTargetUpdates();
      let xrefUpdates = this._computeXrefUpdates(targetUpdates);
      let stateUpdates = substance.map(targetUpdates, this._stateUpdate).concat(substance.map(xrefUpdates, this._stateUpdate));
      // HACK: do not propagate change initially
      this.editorSession.updateNodeStates(stateUpdates, { silent });
    }

    _stateUpdate (record) {
      return [record.id, { label: record.label }]
    }

    _computeTargetUpdates () {
      let resources = this.getCitables();
      let pos = 1;
      let targetUpdates = {};
      for (let res of resources) {
        let id = res.id;
        let label = this.labelGenerator.getLabel([pos]);
        // Note: pos is needed to create order specific labels
        targetUpdates[id] = { id, label, pos };
        pos++;
      }
      return targetUpdates
    }

    _computeXrefUpdates (targetUpdates) {
      const targetIds = new Set(Object.keys(targetUpdates));
      let xrefs = this._getXrefs();
      let xrefUpdates = {};
      for (let xref of xrefs) {
        // ATTENTION: this might not always be numbers, but could also be something like this: [{pos: 1}, {pos: 2}]
        // if citables are nested
        // TODO: find a better name
        let numbers = [];
        // NOTE: if there are rids that can not be resolved as a valid target these will be ignored
        // TODO: in future there should be a IssueManager checking for the validity of these refs
        for (let targetId of xref.refTargets) {
          if (targetIds.has(targetId)) {
            numbers.push(targetUpdates[targetId].pos);
          }
        }
        // invalid labels shall be the same as empty ones
        let id = xref.id;
        let label = this.labelGenerator.getCombinedLabel(numbers);
        xrefUpdates[id] = { id, label };
      }
      return xrefUpdates
    }
  }

  const MANUSCRIPT_MODE = 'manuscript';
  const PREVIEW_MODE = 'preview';
  const METADATA_MODE = 'metadata';

  // Reference Types
  const JOURNAL_ARTICLE_REF = 'journal-article-ref';
  const BOOK_REF = 'book-ref';
  const CHAPTER_REF = 'chapter-ref';
  const CONFERENCE_PAPER_REF = 'conference-paper-ref';
  const DATA_PUBLICATION_REF = 'data-publication-ref';
  const PATENT_REF = 'patent-ref';
  const ARTICLE_REF = 'article-ref';
  const NEWSPAPER_ARTICLE_REF = 'newspaper-article-ref';
  const MAGAZINE_ARTICLE_REF = 'magazine-article-ref';
  const REPORT_REF = 'report-ref';
  const SOFTWARE_REF = 'software-ref';
  const THESIS_REF = 'thesis-ref';
  const WEBPAGE_REF = 'webpage-ref';

  const JATS_BIBR_TYPES_TO_INTERNAL = {
    'journal': JOURNAL_ARTICLE_REF,
    'book': BOOK_REF,
    'chapter': CHAPTER_REF,
    'confproc': CONFERENCE_PAPER_REF,
    'data': DATA_PUBLICATION_REF,
    'patent': PATENT_REF,
    'article': ARTICLE_REF,
    'newspaper': NEWSPAPER_ARTICLE_REF,
    'magazine': MAGAZINE_ARTICLE_REF,
    'report': REPORT_REF,
    'software': SOFTWARE_REF,
    'thesis': THESIS_REF,
    'webpage': WEBPAGE_REF
  };

  const INTERNAL_BIBR_TYPES_TO_JATS = Object.keys(JATS_BIBR_TYPES_TO_INTERNAL).reduce((map, jatsType) => {
    let internalType = JATS_BIBR_TYPES_TO_INTERNAL[jatsType];
    map[internalType] = jatsType;
    return map
  }, {});

  const JATS_BIBR_TYPES = Object.keys(JATS_BIBR_TYPES_TO_INTERNAL);

  const INTERNAL_BIBR_TYPES = Object.keys(INTERNAL_BIBR_TYPES_TO_JATS);

  const LICENSES = [
    {
      id: 'http://creativecommons.org/licenses/by/4.0/',
      name: 'CC BY 4.0'
    },
    {
      id: 'https://creativecommons.org/licenses/by-sa/2.0/',
      name: 'CC BY-SA 2.0'
    }
  ];

  const CARD_MINIMUM_FIELDS = 3;

  // These are intended to be used for labels (lists, references, etc.)
  const LATIN_LETTERS_LOWER_CASE = 'abcdefghijklmnopqrstuvwxyz';
  const LATIN_LETTERS_UPPER_CASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const ROMAN_NUMBERS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVII', 'XIX', 'XX', 'XXI', 'XXII', 'XXIII', 'XXIV', 'XXV', 'XXVI'];
  const ARABIC_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26];
  const SYMBOLS = ((symbols, times) => {
    let res = [];
    for (let n = 1; n <= times; n++) {
      for (let s of symbols) {
        res.push(new Array(n).fill(s).join(''));
      }
    }
    return res
  })(['*', '†', '‡', '¶', '§', '‖', '#'], 4);

  const ABSTRACT_TYPES = [
    {
      id: 'executive-summary',
      name: 'Executive Summary'
    },
    {
      id: 'web-summary',
      name: 'Web Summary'
    }
  ];

  const JATS_GREEN_1_DTD = 'JATS-archivearticle1.dtd';
  const JATS_GREEN_1_0_PUBLIC_ID = '-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.0 20120330//EN';
  const JATS_GREEN_1_1_PUBLIC_ID = '-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.1 20151215//EN';
  const JATS_GREEN_1_2_PUBLIC_ID = '-//NLM//DTD JATS (Z39.96) Journal Archiving and Interchange DTD v1.2 20190208//EN';
  // NOTE: this DTD is used mainly internally so it is not so important how it looks like
  const TEXTURE_JATS_PUBLIC_ID = '-//TEXTURE/DTD Texture JATS DTD v1.0';
  // TODO: we should maintain a DTD and bundle with texture or have it in the github repo
  const TEXTURE_JATS_DTD = 'TextureJATS-1.0.dtd';

  const DEFAULT_JATS_SCHEMA_ID = JATS_GREEN_1_2_PUBLIC_ID;
  const DEFAULT_JATS_DTD = JATS_GREEN_1_DTD;

  // TODO: we need a way to specify which namespaces should be declared
  const EMPTY_JATS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE article PUBLIC "${DEFAULT_JATS_SCHEMA_ID}" "${DEFAULT_JATS_DTD}">
<article xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:ali="http://www.niso.org/schemas/ali/1.0">
  <front>
    <article-meta>
      <title-group>
        <article-title></article-title>
      </title-group>
      <abstract>
      </abstract>
    </article-meta>
  </front>
  <body>
  </body>
  <back>
  </back>
</article>`;

  class FigureLabelGenerator {
    constructor (config = {}) {
      /*
        - name: type name as in 'Figure'
        - plural: type name in plural as in 'Figures'
        - and: string used to join groups, such as ', '
        - to: conjunction in groups such as '-' in 'Figure 1-3'
      */
      this.config = Object.assign({
        singular: 'Figure $',
        plural: 'Figures $',
        join: ', ',
        and: ', and ',
        to: '‒',
        invalid: '???'
      }, config);
    }

    getLabel (...defs) {
      if (defs.length === 0) return this.config.invalid
      // Note: normalizing args so that every def is a tuple
      defs = defs.map(d => {
        if (!substance.isArray(d)) return [d]
        else return d
      });
      if (defs.length === 1) return this.getSingleLabel(defs[0])
      return this.getCombinedLabel(defs)
    }

    getSingleLabel (def) {
      if (!def) return this.config.invalid
      return this._replaceAll(this.config.singular, this._getSingleCounter(def))
    }

    getCombinedLabel (defs) {
      if (defs.length < 2) return this.getSingleLabel(defs[0])

      // sort the records
      defs.sort((a, b) => {
        let a1 = a[0].pos;
        let b1 = b[0].pos;
        if (a1 < b1) return -1
        if (a1 > b1) return 1
        // TODO: here we will need to sort by the panel type
        return a[1].pos - b[1].pos
      });
      // do a segmentation
      let group = [defs[0]];
      let groups = [];
      for (let idx = 0; idx < defs.length; idx++) {
        if (idx === 0) continue
        // a sequence is stopped when
        // - an item has a different level than the previous one
        // - an item on the first level has pos larger than +1 of the previous one
        // - an item on the second level has different type, or a pos larger +1 of the previous one
        let def = defs[idx];
        let prev = defs[idx - 1];
        if (
          (prev.length !== def.length) ||
          (def.length === 1 && def[0].pos > prev[0].pos + 1) ||
          (def.length === 2 && (def[1].type !== prev[1].type || def[0].pos !== prev[0].pos || def[1].pos > prev[1].pos + 1))
        ) {
          groups.push(group);
          group = [def];
        } else {
          group.push(def);
        }
      }
      groups.push(group);

      // and finally compute a label for each group
      let fragments = [];
      for (let group of groups) {
        if (group.length === 1) {
          fragments.push(this._getSingleCounter(group[0]));
        } else {
          fragments.push(this._getGroupCounter(group[0], substance.last(group)));
        }
      }

      // join the fragments
      let combined;
      if (fragments.length > 1) {
        combined = fragments.slice(0, fragments.length - 1).join(this.config.join) + this.config.and + substance.last(fragments);
      } else {
        combined = fragments[0];
      }

      // and return a combined label
      return this._replaceAll(this.config.plural, combined)
    }

    _getSingleCounter (def) {
      if (def.length === 1) {
        return String(def[0].pos)
      } else {
        let figCounter = def[0].pos;
        // TODO: we should think about some way to make this configurable
        return `${figCounter}${this._getPanelLabel(def)}`
      }
    }

    _getPanelLabel (def) {
      let panelCounter = def[1].pos;
      return `${LATIN_LETTERS_UPPER_CASE[panelCounter - 1]}`
    }

    _getGroupCounter (first, last) {
      // ATTENTION: assuming that first and last have the same level (according to our implementation)
      if (first.length === 1) {
        return `${this._getSingleCounter(first)}${this.config.to}${this._getSingleCounter(last)}`
      } else {
        return `${this._getSingleCounter(first)}${this.config.to}${this._getPanelLabel(last)}`
      }
    }

    _replaceAll (t, $) {
      return t.slice(0).replace(/[$]/g, $)
    }
  }

  class FigureManager extends CitableContentManager {
    constructor (editorSession, config) {
      super(editorSession, 'fig', ['figure-panel'], new FigureLabelGenerator(config));
      this._updateLabels('initial');
    }

    _detectAddRemoveCitable (op, change) {
      // in addition to figure add/remove the labels are affected when panels are added/removed or reordered
      return super._detectAddRemoveCitable(op, change) || (op.val && op.val.type === 'figure-panel') || (op.path && op.path[1] === 'panels')
    }

    _getItemSelector () {
      return 'figure-panel'
    }

    _computeTargetUpdates () {
      let doc = this._getDocument();
      let figures = this._getContentElement().findAll('figure');
      let records = {};
      // Iterate through all figures and their panels
      // and generate a record for every item that should be updated
      // leave any information necessary to control the label generator
      let figureCounter = 1;
      for (let figure of figures) {
        let id = figure.id;
        let pos = [{ pos: figureCounter }];
        let label = this.labelGenerator.getSingleLabel(pos);
        records[id] = { id, pos, label };
        // ATTENTION: ATM we do not support any special label generation, such as Figure 1-figure supplement 2, which is controlled via attributes (@specific-use)
        // TODO: to support eLife's 'Figure Supplement' labeling scheme we would use a different counter and some type of encoding
        // e.g. [1, { pos: 1, type: 'supplement' }], we would then
        let panels = substance.documentHelpers.getNodesForIds(doc, figure.panels);
        let panelCounter = 1;
        // processing sub-figures
        if (panels.length > 1) {
          for (let panel of panels) {
            let id = panel.id;
            let pos = [{ pos: figureCounter }, { pos: panelCounter, type: 'default' }];
            let label = this.labelGenerator.getSingleLabel(pos);
            records[id] = { id, pos, label };
            panelCounter++;
          }
        // edge-case: figure-groups with just a single panel get a simple label
        } else {
          let panel = panels[0];
          let id = panel.id;
          let pos = [{ pos: figureCounter }];
          let label = this.labelGenerator.getSingleLabel(pos);
          records[id] = { id, pos, label };
        }
        figureCounter++;
      }
      return records
    }
  }

  class FootnoteManager extends AbstractCitationManager {
    constructor (editorSession, labelGenerator) {
      super(editorSession, 'fn', ['footnote'], labelGenerator);
      // compute initial labels
      this._updateLabels('initial');
    }

    getCitables () {
      let doc = this._getDocument();
      return substance.documentHelpers.getNodesForPath(doc, ['article', 'footnotes'])
    }
  }

  class FormulaManager extends CitableContentManager {
    constructor (editorSession, labelGenerator) {
      super(editorSession, BlockFormula.refType, [BlockFormula.type], labelGenerator);
      this._updateLabels('initial');
    }
  }

  /*
    TODO: discuss

    There is a sophisticated cross-referencing package for latex
    that we took as inspiration: http://mirror.easyname.at/ctan/macros/latex/contrib/cleveref/cleveref.pdf

    This generator needs a set of configurations:

    - name: e.g. 'Figure'
    - plural: e.g. 'Figures'
    - and: e.g, ", ", or " and "
    - to: e.g, "--", or " to "
    - template: outer template, e.g. "[$]" could be used to generate "[1-3,4]"
    - groupTemplate: inner template, e.g. "[$]" could be used to generate "[1-3],[4]"

  */
  const HYPHEN = '‒';

  class NumberedLabelGenerator {
    constructor (config = {}) {
      // for labels with a type name such as 'Figure 1'
      this.name = config.name;
      // for labels with type name, with multiple refs, such as 'Figures 1-3'
      this.plural = config.plural;
      // used to join found groups
      this.and = config.and || ',';
      // used to render a single group
      this.to = config.to || HYPHEN;
      // a string where '$' will be replaced
      // this can be used to wrap the generated string,
      // e.g. "[$]" could be used to generate "[1-3,4]"
      this.template = config.template;
      // a string where '$' will be replaced
      // e.g "[$]" could be used to generate "[1-3],[4]"
      this.groupTemplate = config.groupTemplate;
      this.invalid = config.invalid || '???';
    }

    // TODO: consolidate label generator interface
    getLabel (numbers) {
      if (!numbers) return this.invalid
      if (!substance.isArray(numbers)) numbers = [numbers];
      return this.getCombinedLabel(numbers)
    }

    getCombinedLabel (numbers) {
      if (numbers.length === 0) return this.invalid

      const L = numbers.length;
      // ATTENTION: Array.sort() is sorting lexically!
      numbers.sort((a, b) => a - b);

      let frags = [];
      if (this.name) {
        if (L === 1) {
          frags.push(this.name);
        } else {
          frags.push(this.plural || this.name);
        }
        frags.push(' ');
      }

      // detect groups such as [1,2,3], [6], [8,9]
      let groups = [];
      let group = null;
      const _pushBlock = (g) => {
        if (!substance.isArray(g)) g = [g];
        let str;
        if (g.length === 1) {
          str = String(g[0]);
        } else if (g.length === 2) {
          _pushBlock(g[0]);
          _pushBlock(g[1]);
          return
        } else {
          // join with the 'to' operator, i.e. [1,2,3] => "1 to 3"
          str = String(g[0]) + this.to + String(substance.last(g));
        }
        if (this.groupTemplate) {
          str = this.groupTemplate.slice(0).replace(/[$]/g, str);
        }
        groups.push(str);
      };
      for (let i = 0; i < L; i++) {
        let n = numbers[i];
        if (n === numbers[i - 1] + 1) {
          group.push(n);
        } else {
          if (group) {
            _pushBlock(group);
          }
          group = [n];
        }
      }
      _pushBlock(group);

      // join all groups with the 'and' operator
      // such as ["1-3", "5"] => "1-3, 4"
      frags.push(groups.join(this.and));

      let res = frags.join('');
      if (this.template) {
        res = this.template.slice(0).replace(/[$]/g, res);
      }
      return res
    }
  }

  class ReferenceManager extends AbstractCitationManager {
    constructor (editorSession, config) {
      super(editorSession, 'bibr', ['reference'], new NumberedLabelGenerator(config));
      // compute initial labels
      this._updateLabels('initial');
    }

    getBibliography () {
      return this.getSortedCitables()
    }

    hasCitables () {
      let refIds = this._getRefIds();
      return refIds.length > 0
    }

    getCitables () {
      return substance.documentHelpers.getNodesForIds(this._getDocument(), this._getRefIds())
    }

    _getRefIds () {
      let doc = this._getDocument();
      let article = doc.get('article');
      return article.references
    }

    // overriding because 'reference' is just an abstract parent type
    _detectAddRemoveCitable (op, change) {
      if (op.isCreate() || op.isDelete()) {
        // TODO: it would be nice to have real node instances in change
        // to inspect the class/prototype
        let doc = this._getDocument();
        let schema = doc.getSchema();
        return schema.isInstanceOf(op.val.type, 'reference')
      } else {
        return false
      }
    }
  }

  const UNDEFINED = '?';

  class TableFootnoteManager extends AbstractCitationManager {
    constructor (editorSession, tableFigure) {
      super(editorSession, 'table-fn', ['fn'], new SymbolSetLabelGenerator(SYMBOLS));

      this.tableFigure = tableFigure;

      this._updateLabels('silent');
    }

    _getContentElement () {
      return this.tableFigure
    }

    hasCitables () {
      return (this.tableFigure.footnotes && this.tableFigure.footnotes.length > 0)
    }

    getCitables () {
      let doc = this._getDocument();
      let footnotes = this.tableFigure.footnotes;
      if (footnotes) {
        // NOTE: in case of table removing there might be already no footnotes
        // in the document, so we need to filter out undefined values
        // TODO: can we solve it differently?
        return footnotes.map(id => doc.get(id)).filter(Boolean)
      } else {
        return []
      }
    }

    _detectAddRemoveCitable (op, change) {
      const contentPath = [this.tableFigure.id, 'footnotes'];
      if (substance.isArrayEqual(op.path, contentPath)) {
        const doc = this._getDocument();
        let id = op.diff.val;
        let node = doc.get(id) || change.hasDeleted(id);
        return (node && this.targetTypes.has(node.type))
      } else {
        return false
      }
    }
  }

  class SymbolSetLabelGenerator {
    constructor (symbols) {
      this.symbols = Array.from(symbols);
    }

    getLabel (pos) {
      if (substance.isArray(pos)) {
        pos.sort((a, b) => a - b);
        return pos.map(p => this._getSymbolForPos(p)).join(', ')
      } else {
        return this._getSymbolForPos(pos)
      }
    }

    _getSymbolForPos (pos) {
      return this.symbols[pos - 1] || UNDEFINED
    }
  }

  class TableManager extends CitableContentManager {
    constructor (editorSession, labelGenerator) {
      super(editorSession, 'table', ['table-figure'], labelGenerator);

      this._updateLabels('initial');

      this._initializeTableFootnoteManagers();
    }

    // EXPERIMENTAL:
    // watching changes and creating a TableFootnoteManager whenever a TableFigure is created
    // We should find a better location, or think about a framework to register such managers in general
    // TableManager does actually not have anything to do with table footnotes.
    _onDocumentChange (change) {
      super._onDocumentChange(change);
      this._checkForNewTableFigures(change);
    }

    // EXPERIMENTAL:
    // ... managers should have hooks to do such stuff
    _initializeTableFootnoteManagers () {
      let doc = this._getDocument();
      let tableFigures = doc.getIndex('type').get('table-figure');
      substance.forEach(tableFigures, tableFigure => {
        tableFigure.setFootnoteManager(new TableFootnoteManager(this.editorSession, tableFigure));
      });
    }

    _checkForNewTableFigures (change) {
      let doc = this._getDocument();
      // whenever a table-figure is created we attach a TableFootnoteManager
      for (let op of change.ops) {
        if (op.isCreate()) {
          let node = doc.get(op.getValue().id);
          if (node && node.type === 'table-figure') {
            node.setFootnoteManager(new TableFootnoteManager(this.editorSession, node));
          }
        }
      }
    }
  }

  class SupplementaryManager extends CitableContentManager {
    constructor (editorSession, labelGenerator) {
      super(editorSession, 'file', ['supplementary-file'], labelGenerator);
      this._updateLabels('initial');
    }

    // ATTENTION: for now we consider only supplementary files that are direct children of the body
    // TODO: we need to specify how this should be extended to supplementary files in figure panels
    getCitables () {
      return this._getContentElement().resolve('content').filter(child => child.type === 'supplementary-file')
    }
  }

  class Model {
    constructor (api) {
      this._api = api;
    }

    _getValueModel (propKey) {
      return this._api.getValueModel(propKey)
    }
  }

  /**
   * An extra API for the article, which hides implementation details
   * about how to access certain parts of the document.
   */
  class ArticleModel extends Model {
    getAbstract () {
      return this._getValueModel('article.abstract')
    }

    getAuthors () {
      return this._getValueModel('metadata.authors')
    }

    hasAuthors () {
      return this.getAuthors().length > 0
    }

    getBody () {
      return this._getValueModel('body.content')
    }

    getFootnotes () {
      return this._getValueModel('article.footnotes')
    }

    hasFootnotes () {
      return this.getFootnotes().length > 0
    }

    getReferences () {
      return this._getValueModel('article.references')
    }

    hasReferences () {
      return this.getReferences().length > 0
    }

    getTitle () {
      return this._getValueModel('article.title')
    }

    getSubTitle () {
      return this._getValueModel('article.subTitle')
    }
  }

  const DISALLOWED_MANIPULATION = 'Manipulation is not allowed.';

  class ArticleAPI {
    constructor (editorSession, archive, config) {
      let doc = editorSession.getDocument();

      this.editorSession = editorSession;
      this.config = config;
      this.archive = archive;
      this._document = doc;

      this._articleModel = new ArticleModel(this);
      this._valueModelCache = new Map();

      // TODO: rethink this
      // we created a sub-api for table manipulations in an attempt of modularisation
      this._tableApi = new TableEditingAPI(editorSession);

      // TODO: rethink this
      // Instead we should register these managers as a service, and instantiate on demand
      this._figureManager = new FigureManager(editorSession, config.getValue('figure-label-generator'));
      this._footnoteManager = new FootnoteManager(editorSession, config.getValue('footnote-label-generator'));
      this._formulaManager = new FormulaManager(editorSession, config.getValue('formula-label-generator'));
      this._referenceManager = new ReferenceManager(editorSession, config.getValue('reference-label-generator'));
      this._supplementaryManager = new SupplementaryManager(editorSession, config.getValue('supplementary-file-label-generator'));
      this._tableManager = new TableManager(editorSession, config.getValue('table-label-generator'));
    }

    addAffiliation () {
      this._addEntity(['metadata', 'affiliations'], Affiliation.type);
    }

    addAuthor () {
      this._addEntity(['metadata', 'authors'], Person.type);
    }

    addCustomAbstract () {
      this._addEntity(['article', 'customAbstracts'], CustomAbstract.type, tx => substance.documentHelpers.createNodeFromJson(tx, CustomAbstract.getTemplate()));
    }

    addEditor () {
      this._addEntity(['metadata', 'editors'], Person.type);
    }

    addFunder () {
      this._addEntity(['metadata', 'funders'], Funder.type);
    }

    addGroup () {
      this._addEntity(['metadata', 'groups'], Group.type);
    }

    addKeyword () {
      this._addEntity(['metadata', 'keywords'], Keyword.type);
    }

    addSubject () {
      this._addEntity(['metadata', 'subjects'], Subject.type);
    }

    addFigurePanel (figureId, file) {
      const doc = this.getDocument();
      const figure = doc.get(figureId);
      if (!figure) throw new Error('Figure does not exist')
      const pos = figure.getCurrentPanelIndex();
      const href = this.archive.addAsset(file);
      const insertPos = pos + 1;
      // NOTE: with this method we are getting the structure of the active panel
      // to replicate it, currently only for metadata fields
      const panelTemplate = figure.getTemplateFromCurrentPanel();
      this.editorSession.transaction(tx => {
        let template = FigurePanel.getTemplate();
        template.content.href = href;
        template.content.mimeType = file.type;
        Object.assign(template, panelTemplate);
        let node = substance.documentHelpers.createNodeFromJson(tx, template);
        substance.documentHelpers.insertAt(tx, [figure.id, 'panels'], insertPos, node.id);
        tx.set([figure.id, 'state', 'currentPanelIndex'], insertPos);
      });
    }

    // TODO: it is not so common to add footnotes without an xref in the text
    addFootnote (footnoteCollectionPath) {
      let editorSession = this.getEditorSession();
      editorSession.transaction(tx => {
        let node = substance.documentHelpers.createNodeFromJson(tx, Footnote.getTemplate());
        substance.documentHelpers.append(tx, footnoteCollectionPath, node.id);
        let p = tx.get(node.content[0]);
        tx.setSelection({
          type: 'property',
          path: p.getPath(),
          startOffset: 0,
          surfaceId: this._getSurfaceId(node, 'content'),
          containerPath: [node.id, 'content']
        });
      });
    }

    addReference (refData) {
      this.addReferences([refData]);
    }

    addReferences (refsData) {
      let editorSession = this.getEditorSession();
      editorSession.transaction(tx => {
        let refNodes = refsData.map(refData => substance.documentHelpers.createNodeFromJson(tx, refData));
        refNodes.forEach(ref => {
          substance.documentHelpers.append(tx, ['article', 'references'], ref.id);
        });
        if (refNodes.length > 0) {
          let newSelection = this._createEntitySelection(refNodes[0]);
          tx.setSelection(newSelection);
        }
      });
    }

    canCreateAnnotation (annoType) {
      let editorState = this.getEditorState();
      const sel = editorState.selection;
      const selectionState = editorState.selectionState;
      if (sel && !sel.isNull() && sel.isPropertySelection() && !sel.isCollapsed() && selectionState.property.targetTypes.has(annoType)) {
        // otherwise these annos are only allowed to 'touch' the current selection, not overlap.
        for (let anno of selectionState.annos) {
          if (sel.overlaps(anno.getSelection(), 'strict')) return false
        }
        return true
      }
      return false
    }

    canInsertBlockFormula () {
      return this.canInsertBlockNode(BlockFormula.type)
    }

    canInsertBlockNode (nodeType) {
      let editorState = this.getEditorState();
      let doc = editorState.document;
      let sel = editorState.selection;
      let selState = editorState.selectionState;
      if (sel && !sel.isNull() && !sel.isCustomSelection() && sel.isCollapsed() && selState.containerPath) {
        let containerProp = doc.getProperty(selState.containerPath);
        if (containerProp.targetTypes.has(nodeType)) {
          return true
        }
      }
      return false
    }

    canInsertCrossReference () {
      return this.canInsertInlineNode(Xref.type, true)
    }

    canInsertInlineGraphic () {
      return this.canInsertInlineNode(InlineGraphic.type)
    }

    /**
     * Checks if an inline node can be inserted for the current selection.
     *
     * @param {string} type the type of the inline node
     * @param {boolean} collapsedOnly true if insertion is allowed only for collapsed selection
     */
    canInsertInlineNode (type, collapsedOnly) {
      let editorState = this.getEditorState();
      const sel = editorState.selection;
      const selectionState = editorState.selectionState;
      if (sel && !sel.isNull() && sel.isPropertySelection() && (!collapsedOnly || sel.isCollapsed())) {
        // make sure that the schema allows to insert that node
        let targetTypes = selectionState.property.targetTypes;
        if (targetTypes.size > 0 && targetTypes.has(type)) {
          return true
        }
      }
      return false
    }

    canMoveEntityUp (nodeId) {
      let node = this._getNode(nodeId);
      if (node && this._isCollectionItem(node) && !this._isManagedCollectionItem(node)) {
        return node.getPosition() > 0
      }
    }

    canMoveEntityDown (nodeId) {
      let node = this._getNode(nodeId);
      if (node && this._isCollectionItem(node) && !this._isManagedCollectionItem(node)) {
        let pos = node.getPosition();
        let ids = this.getDocument().get(this._getCollectionPathForItem(node));
        return pos < ids.length - 1
      }
    }

    canRemoveEntity (nodeId) {
      let node = this._getNode(nodeId);
      if (node) {
        return this._isCollectionItem(node)
      } else {
        return false
      }
    }

    copy () {
      return this.getEditorSession().copy()
    }

    cut () {
      return this.getEditorSession().cut()
    }

    dedent () {
      let editorSession = this.getEditorSession();
      editorSession.transaction(tx => {
        tx.dedent();
      });
    }

    deleteSelection (options) {
      const sel = this.getSelection();
      if (sel && !sel.isNull() && !sel.isCollapsed()) {
        this.editorSession.transaction(tx => {
          tx.deleteSelection(options);
        }, { action: 'deleteSelection' });
      }
    }

    focusEditor (path) {
      let editorSession = this.getEditorSession();
      let surface = editorSession.getSurfaceForProperty(path);
      if (surface) {
        surface.selectFirst();
      }
    }

    getEditorState () {
      return this.editorSession.getEditorState()
    }

    getArticleModel () {
      return this._articleModel
    }

    getContext () {
      return this.editorSession.getContext()
    }

    getDocument () {
      return this._document
    }

    getEditorSession () {
      return this.editorSession
    }

    getSelection () {
      return this.editorSession.getSelection()
    }

    /**
     * Provides a model for a property of the document.
     *
     * @param {string|array} propKey path of a property as string or array
     */
    getValueModel (propKey) {
      if (substance.isArray(propKey)) {
        propKey = substance.getKeyForPath(propKey);
      }
      let valueModel = this._valueModelCache.get(propKey);
      if (!valueModel) {
        let doc = this.getDocument();
        let path = propKey.split('.');
        let prop = doc.getProperty(path);
        if (!prop) throw new Error('Property does not exist')
        valueModel = createValueModel(this, path, prop);
      }
      return valueModel
    }

    /**
     * Provides a sub-api for editing tables.
     */
    getTableAPI () {
      return this._tableApi
    }

    indent () {
      let editorSession = this.getEditorSession();
      editorSession.transaction(tx => {
        tx.indent();
      });
    }

    insertBlockFormula () {
      if (!this.canInsertBlockNode(BlockFormula.type)) throw new Error(DISALLOWED_MANIPULATION)
      return this._insertBlockNode(tx => {
        return tx.create({ type: BlockFormula.type })
      })
    }

    insertBlockNode (nodeData) {
      let nodeId = this._insertBlockNode(tx => {
        return substance.documentHelpers.createNodeFromJson(tx, nodeData)
      });
      return this.getDocument().get(nodeId)
    }

    insertBlockQuote () {
      if (!this.canInsertBlockNode(BlockQuote.type)) throw new Error(DISALLOWED_MANIPULATION)
      return this._insertBlockNode(tx => {
        return substance.documentHelpers.createNodeFromJson(tx, BlockQuote.getTemplate())
      })
    }

    insertCrossReference (refType) {
      if (!this.canInsertCrossReference()) throw new Error(DISALLOWED_MANIPULATION)
      return this._insertCrossReference(refType)
    }

    insertFootnoteReference () {
      if (!this.canInsertCrossReference()) throw new Error(DISALLOWED_MANIPULATION)
      // In table-figures we want to allow only cross-reference to table-footnotes
      let selectionState = this.getEditorState().selectionState;
      const xpath = selectionState.xpath;
      let refType = xpath.find(n => n.type === TableFigure.type) ? 'table-fn' : 'fn';
      return this._insertCrossReference(refType)
    }

    // TODO: we should discuss if it would also make sense to create a figure with multiple panels
    insertImagesAsFigures (files) {
      // TODO: we would need a transaction on archive level, creating assets,
      // and then placing them inside the article body.
      // This way the archive gets 'polluted', i.e. a redo of that change does
      // not remove the asset.
      const editorSession = this.getEditorSession();
      let paths = files.map(file => {
        return this.archive.addAsset(file)
      });
      let sel = editorSession.getSelection();
      if (!sel || !sel.containerPath) return
      editorSession.transaction(tx => {
        importFigures(tx, sel, files, paths);
      });
    }

    insertInlineNode (nodeData) {
      let nodeId = this._insertInlineNode(tx => {
        return substance.documentHelpers.createNodeFromJson(tx, nodeData)
      });
      return this.getDocument().get(nodeId)
    }

    insertInlineGraphic (file) {
      if (!this.canInsertInlineGraphic()) throw new Error(DISALLOWED_MANIPULATION)
      const href = this.archive.addAsset(file);
      const mimeType = file.type;
      return this._insertInlineNode(tx => {
        return tx.create({
          type: InlineGraphic.type,
          mimeType,
          href
        })
      })
    }

    insertInlineFormula (content) {
      if (!this.canInsertInlineNode(InlineFormula.type)) throw new Error(DISALLOWED_MANIPULATION)
      return this._insertInlineNode(tx => {
        return tx.create({
          type: InlineFormula.type,
          contentType: 'math/tex',
          content
        })
      })
    }

    insertSupplementaryFile (file, url) {
      const articleSession = this.editorSession;
      if (file) url = this.archive.addAsset(file);
      let sel = articleSession.getSelection();
      articleSession.transaction(tx => {
        let containerPath = sel.containerPath;
        let nodeData = SupplementaryFile.getTemplate();
        nodeData.mimetype = file ? file.type : '';
        nodeData.href = url;
        nodeData.remote = !file;
        let supplementaryFile = substance.documentHelpers.createNodeFromJson(tx, nodeData);
        tx.insertBlockNode(supplementaryFile);
        substance.selectionHelpers.selectNode(tx, supplementaryFile.id, containerPath);
      });
    }

    insertTable () {
      if (!this.canInsertBlockNode(TableFigure.type)) throw new Error(DISALLOWED_MANIPULATION)
      return this._insertBlockNode(tx => {
        return substance.documentHelpers.createNodeFromJson(tx, TableFigure.getTemplate())
      })
    }

    insertText (text) {
      return this.getEditorSession().insertText(text)
    }

    moveEntityUp (nodeId) {
      if (!this.canMoveEntityUp(nodeId)) throw new Error(DISALLOWED_MANIPULATION)
      this._moveEntity(nodeId, -1);
    }

    moveEntityDown (nodeId) {
      if (!this.canMoveEntityDown(nodeId)) throw new Error(DISALLOWED_MANIPULATION)
      this._moveEntity(nodeId, 1);
    }

    paste (content, options) {
      return this.getEditorSession().paste(content, options)
    }

    removeEntity (nodeId) {
      if (!this.canRemoveEntity(nodeId)) throw new Error(DISALLOWED_MANIPULATION)
      let node = this._getNode(nodeId);
      if (!node) throw new Error('Invalid argument.')
      let collectionPath = this._getCollectionPathForItem(node);
      this._removeItemFromCollection(nodeId, collectionPath);
    }

    removeFootnote (footnoteId) {
      // ATTENTION: footnotes appear in different contexts
      // e.g. article.footnotes, or table-fig.footnotes
      let doc = this.getDocument();
      let footnote = doc.get(footnoteId);
      let parent = footnote.getParent();
      this._removeItemFromCollection(footnoteId, [parent.id, 'footnotes']);
    }

    renderEntity (entity, options) {
      let exporter = this.config.createExporter('html');
      return renderEntity(entity, exporter)
    }

    replaceFile (hrefPath, file) {
      const articleSession = this.editorSession;
      const path = this.archive.addAsset(file);
      articleSession.transaction(tx => {
        tx.set(hrefPath, path);
      });
    }

    selectNode (nodeId) {
      let selData = this._createNodeSelection(nodeId);
      if (selData) {
        this.editorSession.setSelection(selData);
      }
    }

    // EXPERIMENTAL need to figure out if we really need this
    // This is used by ManyRelationshipComponent (which is kind of weird)
    selectValue (path) {
      this._setSelection(this._createValueSelection(path));
    }

    selectEntity (node) {
      if (substance.isString(node)) {
        node = this.getDocument().get(node);
      }
      if (node) {
        this._setSelection(this._createEntitySelection(node));
      } else {
        throw new Error('Invalid argument.')
      }
    }

    switchFigurePanel (figure, newPanelIndex) {
      const editorSession = this.editorSession;
      let sel = editorSession.getSelection();
      if (!sel.isNodeSelection() || sel.getNodeId() !== figure.id) {
        this.selectNode(figure.id);
      }
      editorSession.updateNodeStates([[figure.id, { currentPanelIndex: newPanelIndex }]], { propagate: true });
    }

    _addEntity (collectionPath, type, createNode) {
      const editorSession = this.getEditorSession();
      if (!createNode) {
        createNode = tx => tx.create({ type });
      }
      editorSession.transaction(tx => {
        let node = createNode(tx);
        substance.documentHelpers.append(tx, collectionPath, node.id);
        tx.setSelection(this._createEntitySelection(node));
      });
    }

    // This is used by CollectionModel
    _appendChild (collectionPath, data) {
      this.editorSession.transaction(tx => {
        let node = tx.create(data);
        substance.documentHelpers.append(tx, collectionPath, node.id);
      });
    }

    _createNodeSelection (nodeId) {
      let editorState = this.getEditorState();
      let doc = editorState.document;
      const node = doc.get(nodeId);
      if (node) {
        let editorSession = this.getEditorSession();
        let sel = editorState.selection;
        const containerPath = this._getContainerPathForNode(node);
        const surface = editorSession.surfaceManager._getSurfaceForProperty(containerPath);
        const surfaceId = surface ? surface.getId() : (sel ? sel.surfaceId : null);
        return {
          type: 'node',
          nodeId: node.id,
          containerPath,
          surfaceId
        }
      }
    }

    // TODO: think if this is really needed. We could instead try to use NodeSelections
    // this might only problematic cause of the lack of a containerPath
    _createEntitySelection (node, options = {}) {
      return {
        type: 'custom',
        customType: 'entity',
        nodeId: node.id
      }
    }

    _createValueSelection (path) {
      return {
        type: 'custom',
        customType: 'value',
        nodeId: path[0],
        data: {
          path,
          propertyName: path[1]
        },
        surfaceId: path[0]
      }
    }

    _customCopy () {
      if (this._tableApi.isTableSelected()) {
        return this._tableApi.copySelection()
      }
    }

    _customCut () {
      if (this._tableApi.isTableSelected()) {
        return this._tableApi.cut()
      }
    }

    _customInsertText (text) {
      if (this._tableApi.isTableSelected()) {
        this._tableApi.insertText(text);
        return true
      }
    }

    _customPaste (content, options) {
      if (this._tableApi.isTableSelected()) {
        return this._tableApi.paste(content, options)
      }
    }

    // still used?
    _deleteChild (collectionPath, child, txHook) {
      this.editorSession.transaction(tx => {
        substance.documentHelpers.removeFromCollection(tx, collectionPath, child.id);
        substance.documentHelpers.deepDeleteNode(tx, child);
        if (txHook) {
          txHook(tx);
        }
      });
    }

    // EXPERIMENTAL
    // this is called by ManyRelationshipComponent and SingleRelationshipComponent to get
    // options for the selection
    // TODO: I am not sure if it is the right approach, trying to generalize this
    // Instead we could use dedicated Components derived from the ones from the kit
    // and use specific API to accomplish this
    _getAvailableOptions (model) {
      let targetTypes = Array.from(model._targetTypes);
      if (targetTypes.length !== 1) {
        throw new Error('Unsupported relationship. Expected to find one targetType')
      }
      let doc = this.getDocument();
      let first = targetTypes[0];
      let targetType = first;
      switch (targetType) {
        case 'funder': {
          return doc.get('metadata').resolve('funders')
        }
        case 'affiliation': {
          return doc.get('metadata').resolve('affiliations')
        }
        case 'group': {
          return doc.get('metadata').resolve('groups')
        }
        default:
          throw new Error('Unsupported relationship: ' + targetType)
      }
    }

    // TODO: how could we make this extensible via plugins?
    _getAvailableXrefTargets (xref) {
      let refType = xref.refType;
      let manager;
      switch (refType) {
        case BlockFormula.refType: {
          manager = this._formulaManager;
          break
        }
        case 'fig': {
          manager = this._figureManager;
          break
        }
        case 'fn': {
          // EXPERIMENTAL: table footnotes
          // TableFootnoteManager is stored on the TableFigure instance
          let tableFigure = findParentByType(xref, 'table-figure');
          if (tableFigure) {
            manager = tableFigure.getFootnoteManager();
          } else {
            manager = this._footnoteManager;
          }
          break
        }
        case 'table-fn': {
          let tableFigure = findParentByType(xref, 'table-figure');
          if (tableFigure) {
            manager = tableFigure.getFootnoteManager();
          }
          break
        }
        case 'bibr': {
          manager = this._referenceManager;
          break
        }
        case 'table': {
          manager = this._tableManager;
          break
        }
        case 'file': {
          manager = this._supplementaryManager;
          break
        }
        default:
          throw new Error('Unsupported xref type: ' + refType)
      }
      if (!manager) return []

      let selectedTargets = xref.resolve('refTargets');
      // retrieve all possible nodes that this
      // xref could potentially point to,
      // so that we can let the user select from a list.
      let availableTargets = manager.getSortedCitables();
      let targets = availableTargets.map(target => {
        // ATTENTION: targets are not just nodes
        // but entries with some information
        return {
          selected: substance.includes(selectedTargets, target),
          node: target,
          id: target.id
        }
      });
      // Determine broken targets (such that don't exist in the document)
      let brokenTargets = substance.without(selectedTargets, ...availableTargets);
      if (brokenTargets.length > 0) {
        targets = targets.concat(brokenTargets.map(id => {
          return { selected: true, id }
        }));
      }
      // Makes the selected targets go to top
      targets = substance.orderBy(targets, ['selected'], ['desc']);
      return targets
    }

    _getCollectionPathForItem (node) {
      let parent = node.getParent();
      let propName = node.getXpath().property;
      if (parent && propName) {
        let collectionPath = [parent.id, propName];
        let property = node.getDocument().getProperty(collectionPath);
        if (property.isArray() && property.isReference()) {
          return collectionPath
        }
      }
    }

    _getContainerPathForNode (node) {
      let last = node.getXpath();
      let prop = last.property;
      let prev = last.prev;
      if (prev && prop) {
        return [prev.id, prop]
      }
    }

    _getFirstRequiredProperty (node) {
      // TODO: still not sure if this is the right approach
      // Maybe it would be simpler to just use configuration
      // and fall back to 'node' or 'card' selection otherwise
      let schema = node.getSchema();
      for (let p of schema) {
        if (p.name === 'id' || !this._isFieldRequired([node.type, p.name])) continue
        return p
      }
    }

    _getNode (nodeId) {
      return nodeId._isNode ? nodeId : this.getDocument().get(nodeId)
    }

    // EXPERIMENTAL: trying to derive a surfaceId for a property in a specific node
    // exploiting knowledge about the implemented view structure
    // in manuscript it is either top-level (e.g. title, abstract) or part of a container (body)
    _getSurfaceId (node, propertyName) {
      let xpath = node.getXpath().toArray();
      let idx = xpath.findIndex(entry => entry.id === 'body');
      let relXpath;
      if (idx >= 0) {
        relXpath = xpath.slice(idx);
      } else {
        relXpath = xpath.slice(-1);
      }
      // the 'trace' is concatenated using '/' and the property name appended via '.'
      return relXpath.map(e => e.id).join('/') + '.' + propertyName
    }

    _insertBlockNode (createNode) {
      let editorSession = this.getEditorSession();
      let nodeId;
      editorSession.transaction(tx => {
        let node = createNode(tx);
        tx.insertBlockNode(node);
        tx.setSelection(this._createNodeSelection(node));
        nodeId = node.id;
      });
      return nodeId
    }

    _insertCrossReference (refType) {
      this._insertInlineNode(tx => {
        return tx.create({
          type: Xref.type,
          refType
        })
      });
    }

    _insertInlineNode (createNode) {
      let editorSession = this.getEditorSession();
      let nodeId;
      editorSession.transaction(tx => {
        let inlineNode = createNode(tx);
        tx.insertInlineNode(inlineNode);
        // TODO: some inline nodes have an input field
        // which we might want to focus initially
        // instead of selecting the whole node
        tx.setSelection(this._selectInlineNode(inlineNode));
        nodeId = inlineNode.id;
      });
      return nodeId
    }

    _isCollectionItem (node) {
      return !substance.isNil(this._getCollectionPathForItem(node))
    }

    _isFieldRequired (path) {
      // ATTENTION: this API is experimental
      let settings = this.getEditorState().settings;
      let valueSettings = settings.getSettingsForValue(path);
      return Boolean(valueSettings['required'])
    }

    _isManagedCollectionItem (node) {
      // ATM, only references are managed (i.e. not sorted manually)
      return node.isInstanceOf(Reference.type)
    }

    // TODO: we need a better way to update settings
    _loadSettings (settings) {
      let editorState = this.getContext().editorState;
      editorState.settings.load(settings);
      editorState._setDirty('settings');
      editorState.propagateUpdates();
    }

    _moveEntity (nodeId, shift) {
      let node = this._getNode(nodeId);
      if (!node) throw new Error('Invalid argument.')
      let collectionPath = this._getCollectionPathForItem(node);
      this._moveChild(collectionPath, nodeId, shift);
    }

    // Used by MoveMetadataFieldCommand(FigureMetadataCommands)
    // and MoveFigurePanelCommand (FigurePanelCommands)
    // txHook isued by MoveFigurePanelCommand to update the node state
    // This needs a little more thinking, however, making it apparent
    // that in some cases it is not so easy to completely separate Commands
    // from EditorSession logic
    _moveChild (collectionPath, childId, shift, txHook) {
      this.editorSession.transaction(tx => {
        let ids = tx.get(collectionPath);
        let pos = ids.indexOf(childId);
        if (pos === -1) return
        substance.documentHelpers.removeAt(tx, collectionPath, pos);
        substance.documentHelpers.insertAt(tx, collectionPath, pos + shift, childId);
        if (txHook) {
          txHook(tx);
        }
      });
    }

    // used by CollectionModel
    _removeChild (collectionPath, childId) {
      this._removeItemFromCollection(childId, collectionPath);
    }

    // This method is used to cleanup xref targets
    // during footnote or reference removing
    _removeCorrespondingXrefs (tx, node) {
      let manager;
      if (node.isInstanceOf(Reference.type)) {
        manager = this._referenceManager;
      } else if (node.isInstanceOf(Footnote.type)) {
        manager = this._footnoteManager;
      } else {
        return
      }
      manager._getXrefs().forEach(xref => {
        const index = xref.refTargets.indexOf(node.id);
        if (index > -1) {
          tx.update([xref.id, 'refTargets'], { type: 'delete', pos: index });
        }
      });
    }

    _removeItemFromCollection (itemId, collectionPath) {
      const editorSession = this.getEditorSession();
      editorSession.transaction(tx => {
        let item = tx.get(itemId);
        substance.documentHelpers.removeFromCollection(tx, collectionPath, itemId);
        // TODO: discuss if we really should do this, or want to do something different.
        this._removeCorrespondingXrefs(tx, item);
        substance.documentHelpers.deepDeleteNode(tx, itemId);
        tx.selection = null;
      });
    }

    _replaceSupplementaryFile (file, supplementaryFile) {
      const articleSession = this.editorSession;
      const path = this.archive.addAsset(file);
      articleSession.transaction(tx => {
        const mimeData = file.type.split('/');
        tx.set([supplementaryFile.id, 'mime-subtype'], mimeData[1]);
        tx.set([supplementaryFile.id, 'mimetype'], mimeData[0]);
        tx.set([supplementaryFile.id, 'href'], path);
      });
    }

    _selectInlineNode (inlineNode) {
      return {
        type: 'property',
        path: inlineNode.getPath(),
        startOffset: inlineNode.start.offset,
        endOffset: inlineNode.end.offset
      }
    }

    _setSelection (sel) {
      this.editorSession.setSelection(sel);
    }

    _toggleRelationship (path, id) {
      this.editorSession.transaction(tx => {
        let ids = tx.get(path);
        let idx = ids.indexOf(id);
        if (idx === -1) {
          tx.update(path, { type: 'insert', pos: ids.length, value: id });
        } else {
          tx.update(path, { type: 'delete', pos: idx, value: id });
        }
        tx.setSelection(this._createValueSelection(path));
      });
    }

    _toggleXrefTarget (xref, targetId) {
      let targetIds = xref.refTargets;
      let index = targetIds.indexOf(targetId);
      if (index >= 0) {
        this.editorSession.transaction(tx => {
          tx.update([xref.id, 'refTargets'], { type: 'delete', pos: index });
        });
      } else {
        this.editorSession.transaction(tx => {
          tx.update([xref.id, 'refTargets'], { type: 'insert', pos: targetIds.length, value: targetId });
        });
      }
    }
  }

  class ArticleEditorSession extends substance.EditorSession {
    copy () {
      return this.context.api._customCopy() || super.copy()
    }
    cut () {
      return this.context.api._customCut() || super.cut()
    }
    paste (content, options) {
      return this.context.api._customPaste(content, options) || super.paste(content, options)
    }
    insertText (text) {
      return this.context.api._customInsertText(text) || super.insertText(text)
    }
  }

  /**
   * A base implementation for commands that add an entity, e.g. a Reference, to
   * a collection.
   */
  class AddEntityCommand extends substance.Command {
    getCommandState () {
      return { disabled: false }
    }

    execute (params, context) {
      throw new Error('This is abstract')
    }
  }

  class AddAuthorCommand extends AddEntityCommand {
    execute (params, context) {
      context.editorSession.getRootComponent().send('startWorkflow', 'add-author-workflow');
    }
  }

  class AddAffiliationCommand extends AddEntityCommand {
    execute (params, context) {
      context.editorSession.getRootComponent().send('startWorkflow', 'add-affiliation-workflow');
    }
  }

  class AddAuthorCommand$1 extends AddEntityCommand {
    execute (params, context) {
      context.editorSession.getRootComponent().send('startWorkflow', 'add-reference-workflow');
    }
  }

  class AnnotationCommand extends substance.AnnotationCommand {
    canCreate (annos, sel, context) {
      return context.api.canCreateAnnotation(this.getType())
    }
  }

  class DecreaseHeadingLevelCommand extends substance.Command {
    getCommandState (params, context) {
      let selState = context.editorState.selectionState;
      if (selState && selState.node && selState.node.type === 'heading') {
        return { disabled: selState.node.level <= Heading.MIN_LEVEL }
      } else {
        return { disabled: true }
      }
    }

    execute (params, context) {
      context.api.dedent();
    }
  }

  /*
    We are using this command only for state computation.
    Actual implementation of file downloading is done inside DownloadSupplementaryFileTool
  */
  class DownloadSupplementaryFileCommand extends substance.Command {
    getCommandState (params, context) {
      const selectionState = params.selectionState;
      const xpath = selectionState.xpath;
      if (xpath.length > 0) {
        const selectedType = xpath[xpath.length - 1].type;
        if (selectedType === 'supplementary-file') {
          return {
            disabled: false,
            // leaving the node, so that the tool can apply different
            // strategies for local vs remote files
            node: selectionState.node
          }
        }
      }
      return { disabled: true }
    }

    execute (params, context) {
      // Nothing: downloading is implemented via native download hooks
    }
  }

  class EditEntityCommand extends substance.Command {
    getCommandState (params, context) {
      let selectionState = context.editorState.selectionState;
      let node = selectionState.node;
      if (node && node.isInstanceOf(this._getType())) {
        return {
          disabled: false,
          node
        }
      } else {
        return { disabled: true }
      }
    }

    execute (params, context) {
      // TODO: this might not be general enough, maybe we could introduce edit-entity-workflow
      // which could just be derived from edit-metadata-workflow
      let commandState = params.commandState;
      context.editorSession.getRootComponent().send('startWorkflow', 'edit-metadata-workflow', { nodeId: commandState.node.id });
    }

    _getType () {
      throw new Error('This is abstract')
    }
  }

  class EditAuthorCommand extends EditEntityCommand {
    _getType () {
      return Person.type
    }
    getCommandState (params, context) {
      let commandState = super.getCommandState(params, context);
      if (!commandState.disabled) {
        let node = commandState.node;
        let xpath = node.getXpath().toArray();
        if (!xpath.find(x => x.property === 'authors')) {
          return { disabled: true }
        }
      }
      return commandState
    }
  }

  class EditMetadataCommand extends substance.Command {
    getCommandState () {
      return { disabled: false }
    }

    execute (params, context) {
      context.editorSession.getRootComponent().send('startWorkflow', 'edit-metadata-workflow');
    }
  }

  class EditReferenceCommand extends EditEntityCommand {
    _getType () {
      return Reference.type
    }
  }

  // TODO: refactor this so that editorSession.transaction() is not used directly
  // but only via context.api.
  // Also, this implementation is kind of tight to Figures. However, such metadata fields could occurr in other environments as well, e.g. tables.
  // And pull out commands in individual files.

  class BasicFigureMetadataCommand extends substance.Command {
    get contextType () {
      return MetadataField.type
    }

    getCommandState (params, context) {
      return {
        disabled: this.isDisabled(params, context)
      }
    }

    isDisabled (params) {
      const xpath = params.selectionState.xpath;
      return !xpath.find(n => n.type === this.contextType)
    }

    _getCollectionPath (params, context) {
      const doc = params.editorSession.getDocument();
      const nodeId = params.selection.getNodeId();
      const node = doc.get(nodeId);
      let figurePanelId = node.id;
      if (params.selection.type === 'node' && this.contextType === Figure.type) {
        const currentIndex = node.getCurrentPanelIndex();
        figurePanelId = node.panels[currentIndex];
      } else if (node.type !== FigurePanel.type) {
        const parentFigurePanel = findParentByType(node, FigurePanel.type);
        figurePanelId = parentFigurePanel.id;
      }
      return [figurePanelId, 'metadata']
    }
  }

  class AddFigureMetadataFieldCommand extends BasicFigureMetadataCommand {
    get contextType () {
      return 'figure'
    }

    execute (params, context) {
      const collectionPath = this._getCollectionPath(params, context);
      context.editorSession.transaction(tx => {
        let node = substance.documentHelpers.createNodeFromJson(tx, MetadataField.getTemplate());
        substance.documentHelpers.append(tx, collectionPath, node.id);
        const path = [node.id, 'name'];
        const viewName = context.editorState.viewName;
        const surfaceId = context.api._getSurfaceId(node, 'name', viewName);
        tx.setSelection({
          type: 'property',
          path,
          startOffset: 0,
          surfaceId
        });
      });
    }
  }

  class RemoveMetadataFieldCommand extends BasicFigureMetadataCommand {
    execute (params, context) {
      const collectionPath = this._getCollectionPath(params, context);
      context.editorSession.transaction(tx => {
        const nodeId = tx.selection.getNodeId();
        substance.documentHelpers.removeFromCollection(tx, collectionPath, nodeId);
        tx.selection = null;
      });
    }
  }

  class MoveMetadataFieldCommand extends BasicFigureMetadataCommand {
    execute (params, context) {
      const direction = this.config.direction;
      const collectionPath = this._getCollectionPath(params, context);
      const nodeId = params.selection.getNodeId();
      const shift = direction === 'up' ? -1 : 1;
      context.api._moveChild(collectionPath, nodeId, shift);
    }

    isDisabled (params, context) {
      const matchSelection = !super.isDisabled(params);
      if (matchSelection) {
        const direction = this.config.direction;
        const collectionPath = this._getCollectionPath(params, context);
        const nodeId = params.selection.getNodeId();
        const doc = context.editorSession.getDocument();
        const customFieldsIndex = doc.get(collectionPath);
        const currentIndex = customFieldsIndex.indexOf(nodeId);
        if (customFieldsIndex.length > 0) {
          if ((direction === 'up' && currentIndex > 0) || (direction === 'down' && currentIndex < customFieldsIndex.length - 1)) {
            return false
          }
        }
      }
      return true
    }
  }

  class BasicFigurePanelCommand extends substance.Command {
    getCommandState (params, context) {
      return {
        disabled: this.isDisabled(params, context)
      }
    }

    isDisabled (params) {
      const xpath = params.selectionState.xpath;
      return !xpath.find(n => n.type === 'figure')
    }

    _getFigure (params, context) {
      const sel = params.selection;
      const doc = params.editorSession.getDocument();
      let nodeId = sel.getNodeId();
      const selectedNode = doc.get(nodeId);
      if (selectedNode.type !== 'figure') {
        const node = findParentByType(selectedNode, 'figure');
        nodeId = node.id;
      }
      return doc.get(nodeId)
    }

    _getFigurePanel (params, context) {
      const figure = this._getFigure(params, context);
      const currentIndex = figure.getCurrentPanelIndex();
      const doc = figure.getDocument();
      return doc.get(figure.panels[currentIndex])
    }

    _matchSelection (params, context) {
      const xpath = params.selectionState.xpath;
      const isInFigure = xpath.find(n => n.type === 'figure');
      return isInFigure
    }
  }

  class AddFigurePanelCommand extends BasicFigurePanelCommand {
    execute (params, context) {
      const files = params.files;
      // TODO: why only one file? we could also add multiple panels at once
      if (files.length > 0) {
        const file = files[0];
        const figure = this._getFigure(params, context);
        context.api.addFigurePanel(figure.id, file);
      }
    }
  }

  class ReplaceFigurePanelImageCommand extends BasicFigurePanelCommand {
    execute (params, context) {
      const figurePanel = this._getFigurePanel(params, context);
      const files = params.files;
      if (files.length > 0) {
        let graphic = figurePanel.getContent();
        context.api.replaceFile([graphic.id, 'href'], files[0]);
      }
    }

    isDisabled (params, context) {
      const matchSelection = this._matchSelection(params, context);
      if (matchSelection) return false
      return true
    }
  }

  class RemoveFigurePanelCommand extends BasicFigurePanelCommand {
    execute (params, context) {
      const api = context.api;
      const figure = this._getFigure(params, context);
      const figurePanel = this._getFigurePanel(params, context);
      // TODO: this shows that generic API does not work without additional steps
      api._deleteChild([figure.id, 'panels'], figurePanel, tx => {
        tx.selection = null;
      });
    }

    isDisabled (params, context) {
      const matchSelection = this._matchSelection(params, context);
      if (matchSelection) {
        const figure = this._getFigure(params, context);
        if (figure.panels.length > 1) {
          return false
        }
      }
      return true
    }
  }

  class MoveFigurePanelCommand extends BasicFigurePanelCommand {
    execute (params, context) {
      // NOTE: this is an example where IMO it will be difficult
      // to separate Commands from EditorSession logic,
      // other than adding an API method for doing exactly this
      // TODO: consider adding a FigureAPI to ArticleAPI
      const direction = this.config.direction;
      const figure = this._getFigure(params, context);
      const figurePanel = this._getFigurePanel(params, context);
      const pos = figurePanel.getPosition();
      const shift = direction === 'up' ? -1 : 1;
      context.api._moveChild([figure.id, 'panels'], figurePanel.id, shift, tx => {
        tx.set([figure.id, 'state', 'currentPanelIndex'], pos + shift);
      });
    }

    isDisabled (params, context) {
      const matchSelection = this._matchSelection(params, context);
      if (matchSelection) {
        const figure = this._getFigure(params, context);
        const currentIndex = figure.getCurrentPanelIndex();
        const direction = this.config.direction;
        if (figure.panels.length > 1) {
          if ((direction === 'up' && currentIndex > 0) || (direction === 'down' && currentIndex < figure.panels.length - 1)) {
            return false
          }
        }
      }
      return true
    }
  }

  class OpenFigurePanelImageCommand extends BasicFigurePanelCommand {
    // We are using this command only for state computation.
    // Actual implementation of opening sub-figure is done inside OpenSubFigureSourceTool.
    execute () {
    }
  }

  class IncreaseHeadingLevelCommand extends substance.Command {
    getCommandState (params, context) {
      let selState = context.editorState.selectionState;
      if (selState && selState.node && selState.node.type === 'heading') {
        return { disabled: selState.node.level >= Heading.MAX_LEVEL }
      } else {
        return { disabled: true }
      }
    }

    execute (params, context) {
      context.api.indent();
    }
  }

  class InsertNodeCommand extends substance.InsertNodeCommand {
    execute (params, context) {
      throw new Error('This method is abstract')
    }
  }

  class InsertBlockFormulaCommand extends InsertNodeCommand {
    getType () {
      return BlockFormula.type
    }

    execute (params, context) {
      context.api.insertBlockFormula();
    }
  }

  class InsertBlockQuoteCommand extends InsertNodeCommand {
    getType () {
      return BlockQuote.type
    }
    execute (params, context) {
      context.api.insertBlockQuote();
    }
  }

  class InsertInlineNodeCommand extends substance.InsertInlineNodeCommand {
    getType () {
      throw new Error('This method is abstract')
    }

    /**
      Insert new inline node at the current selection
    */
    execute (params, context) {
      throw new Error('This method is abstract')
    }

    isDisabled (params, context) {
      return !context.api.canInsertInlineNode(this.getType(), true)
    }
  }

  class InsertCrossReferenceCommand extends InsertInlineNodeCommand {
    getType () {
      return 'xref'
    }

    execute (params, context) {
      context.api.insertCrossReference(this.config.refType);
    }
  }

  class InsertExtLinkCommand extends AnnotationCommand {}

  // TODO: this is kind of surprising, because it actually allows to insert multiple figures at once
  class InsertFigureCommand extends InsertNodeCommand {
    getType () {
      return Figure.type
    }
    execute (params, context) {
      const state = params.commandState;
      const files = params.files;
      if (state.disabled) return
      if (files.length > 0) {
        context.api.insertImagesAsFigures(files);
      }
    }
  }

  class InsertFootnoteCommand extends AddEntityCommand {
    detectScope (params) {
      const xpath = params.selectionState.xpath;
      return xpath.find(n => n.type === 'table-figure') ? 'table-figure' : 'default'
    }

    _getCollectionPath (params, context) {
      const scope = this.detectScope(params);
      if (scope === 'default') {
        return ['article', 'footnotes']
      } else {
        const doc = params.editorSession.getDocument();
        const nodeId = params.selection.getNodeId();
        const node = doc.get(nodeId);
        let tableNodeId = node.id;
        // check if we are already selected table-figure
        if (node.type !== 'table-figure') {
          const parentTable = findParentByType(node, 'table-figure');
          tableNodeId = parentTable.id;
        }
        return [tableNodeId, 'footnotes']
      }
    }

    execute (params, context) {
      let footnoteCollectionPath = this._getCollectionPath(params, context);
      context.api.addFootnote(footnoteCollectionPath);
    }
  }

  class InsertFootnoteCrossReferenceCommand extends InsertCrossReferenceCommand {
    execute (params, context) {
      context.api.insertFootnoteReference();
    }
  }

  class InsertInlineFormulaCommand extends InsertInlineNodeCommand {
    getType () {
      return 'inline-formula'
    }

    execute (params, context) {
      let selectionState = context.editorState.get('selectionState');
      context.api.insertInlineFormula(selectionState.selectedText);
    }
  }

  class InsertInlineGraphicCommand extends InsertInlineNodeCommand {
    getType () {
      return 'inline-graphic'
    }

    execute (params, context) {
      const files = params.files;
      if (files.length > 0) {
        context.api.insertInlineGraphic(files[0]);
      }
    }
  }

  /*
    This command is opening a workflow when it is possible to insert a node.
    Use it when you want to insert a node after additional workflow step.
  */
  class InsertNodeFromWorkflowCommand extends InsertNodeCommand {
    execute (params, context) {
      const workflow = this.config.workflow;
      context.editorSession.getRootComponent().send('startWorkflow', workflow);
    }
  }

  class InsertTableCommand extends InsertNodeCommand {
    execute (params, context) {
      context.api.insertTable();
    }
  }

  // TODO: pull out commands into individual files
  // and move manipulation code into ArticleAPI

  // turns the current text node into a list
  class CreateListCommand extends substance.Command {
    isSwitchTypeCommand () { return true }

    // TODO: do we want to generalize this to other list types?
    getType () {
      return 'list'
    }

    getCommandState (params) {
      let editorSession = params.editorSession;
      let doc = editorSession.getDocument();
      let sel = editorSession.getSelection();
      if (sel && sel.isPropertySelection()) {
        let path = sel.path;
        let node = doc.get(path[0]);
        if (node) {
          if (node.isText()) {
            return {
              disabled: false
            }
          }
        }
      }
      return { disabled: true }
    }

    execute (params) {
      let commandState = params.commandState;
      const { disabled } = commandState;
      if (disabled) return
      let editorSession = params.editorSession;
      editorSession.transaction(tx => {
        tx.toggleList({ listType: this.config.spec.listType });
      }, { action: 'toggleList' });
    }
  }

  class ChangeListTypeCommand extends substance.Command {
    getCommandState (params) {
      let editorSession = params.editorSession;
      let doc = editorSession.getDocument();
      let sel = editorSession.getSelection();
      if (sel && sel.isPropertySelection()) {
        let path = sel.path;
        let node = doc.get(path[0]);
        if (node) {
          if (node.isListItem()) {
            let level = node.getLevel();
            let list = node.getParent();
            let listType = list.getListType(level);
            let active = listType === this.config.spec.listType;
            let action = active ? 'toggleList' : 'setListType';
            let listId = list.id;
            return {
              disabled: false,
              active,
              action,
              listId,
              level
            }
          }
        }
      }
      return { disabled: true }
    }

    execute (params) {
      let commandState = params.commandState;
      const { disabled, action } = commandState;
      if (disabled) return

      let editorSession = params.editorSession;
      switch (action) {
        case 'toggleList': {
          editorSession.transaction((tx) => {
            tx.toggleList();
          }, { action: 'toggleList' });
          break
        }
        case 'setListType': {
          const { listId, level } = commandState;
          editorSession.transaction((tx) => {
            let list = tx.get(listId);
            list.setListType(level, this.config.spec.listType);
          }, { action: 'setListType' });
          break
        }
        default:
        //
      }
    }
  }

  class RemoveItemCommand extends substance.Command {
    getCommandState (params, context) {
      let node = this._getNode(params);
      return {
        disabled: !node,
        nodeId: node ? node.id : null
      }
    }

    _getNode (params) {
      const nodeType = this.config.nodeType;
      const sel = params.selection;
      if (sel && !sel.isNull()) {
        const doc = params.editorSession.getDocument();
        const nodeId = sel.getNodeId();
        if (nodeId) {
          const selectedNode = doc.get(nodeId);
          if (selectedNode) {
            if (selectedNode.type === nodeType) return selectedNode
            return findParentByType(selectedNode, nodeType)
          }
        }
      }
    }
  }

  class RemoveFootnoteCommand extends RemoveItemCommand {
    execute (params, context) {
      context.api.removeFootnote(params.commandState.nodeId);
    }
  }

  class RemoveReferenceCommand extends RemoveItemCommand {
    execute (params, context) {
      context.api.removeReference(params.commandState.nodeId);
    }
  }

  class ReplaceSupplementaryFileCommand extends substance.Command {
    getCommandState (params, context) {
      const xpath = params.selectionState.xpath;
      if (xpath.length > 0) {
        const selectedType = xpath[xpath.length - 1].type;
        if (selectedType === 'supplementary-file') {
          const node = params.selectionState.node;
          if (!node.remote) {
            return { disabled: false }
          }
        }
      }
      return { disabled: true }
    }

    execute (params, context) {
      const state = params.commandState;
      if (state.disabled) return
      const files = params.files;
      const supplementaryFileNode = params.selectionState.node;
      let api = context.api;
      if (files.length > 0) {
        api._replaceSupplementaryFile(files[0], supplementaryFileNode);
      }
    }
  }

  const DISABLED$1 = { disabled: true };

  // TODO: pull commands into single files.
  // and move manipulation code into ArticleAPI

  class BasicTableCommand extends substance.Command {
    getCommandState (params, context) { // eslint-disable-line no-unused-vars
      const tableApi = context.api.getTableAPI();
      if (!tableApi.isTableSelected()) return DISABLED$1
      const selData = tableApi._getSelectionData();
      return Object.assign({ disabled: false }, selData)
    }

    execute (params, context) { // eslint-disable-line no-unused-vars
      const commandState = params.commandState;
      if (commandState.disabled) return

      const tableApi = context.api.getTableAPI();
      return this._execute(tableApi, commandState)
    }
  }

  class InsertCellsCommand extends BasicTableCommand {
    _execute (tableApi, { ncols, nrows }) {
      const mode = this.config.spec.pos;
      const dim = this.config.spec.dim;
      if (dim === 'row') {
        tableApi.insertRows(mode, nrows);
      } else {
        tableApi.insertCols(mode, ncols);
      }
      return true
    }
  }

  class DeleteCellsCommand extends BasicTableCommand {
    _execute (tableApi, { startRow, startCol, nrows, ncols }) {
      const dim = this.config.spec.dim;
      if (dim === 'row') {
        tableApi.deleteRows();
      } else {
        tableApi.deleteCols();
      }
      return true
    }
  }

  class TableSelectAllCommand extends BasicTableCommand {
    _execute (tableApi) {
      tableApi.selectAll();
      return true
    }
  }

  class ToggleCellHeadingCommand extends BasicTableCommand {
    getCommandState (params, context) { // eslint-disable-line no-unused-vars
      let commandState = super.getCommandState(params, context);
      if (commandState.disabled) return commandState

      let { table, startRow, endRow, startCol, endCol } = commandState;
      let cells = substance.getRangeFromMatrix(table.getCellMatrix(), startRow, startCol, endRow, endCol, true);
      cells = substance.flatten(cells).filter(c => !c.shadowed);
      let onlyHeadings = true;
      for (let i = 0; i < cells.length; i++) {
        if (!cells[i].heading) {
          onlyHeadings = false;
          break
        }
      }
      return Object.assign(commandState, {
        active: onlyHeadings,
        cellIds: cells.map(c => c.id)
      })
    }

    _execute (tableApi, { cellIds, heading }) {
      tableApi.toggleHeading(cellIds);
      return true
    }
  }

  class ToggleCellMergeCommand extends BasicTableCommand {
    getCommandState (params, context) { // eslint-disable-line no-unused-vars
      let commandState = super.getCommandState(params, context);
      if (commandState.disabled) return commandState

      let { table, nrows, ncols, startRow, startCol } = commandState;
      let cell = table.getCell(startRow, startCol);
      let rowspan = cell.rowspan;
      let colspan = cell.colspan;
      // ATTENTION: at the moment the selection is expressed in absolute
      // rows and cols, not considering colspans and rowspans
      // If a single cell with row- or colspan is selected, then
      // nrows=rowspan and ncols=colspan
      if (nrows > 1 || ncols > 1) {
        if (rowspan < nrows || colspan < ncols) {
          commandState.merge = true;
        } else {
          commandState.active = true;
          commandState.unmerge = true;
        }
      }
      // only enable if one merge option is enabled
      // TODO: if table commands are enabled this command should
      // be shown even if disabled
      if (!commandState.merge && !commandState.unmerge) {
        return DISABLED$1
      }
      return commandState
    }

    _execute (tableApi, { merge, unmerge }) {
      if (merge) {
        tableApi.merge();
      } else if (unmerge) {
        tableApi.unmerge();
      }
      return true
    }
  }

  // TODO: move manipulation code into ArticleAPI

  class ToggleListCommand extends substance.Command {
    isSwitchTypeCommand () { return true }

    // TODO: do we want to generalize this to other list types?
    getType () {
      return 'list'
    }

    /*
      Note: this implementation is still very coupled with the specific internal data model.
      TODO: we could try to use API to generalize this
    */
    getCommandState (params) {
      let editorSession = params.editorSession;
      let doc = editorSession.getDocument();
      let sel = editorSession.getSelection();
      if (sel && sel.isPropertySelection()) {
        let path = sel.path;
        let node = doc.get(path[0]);
        if (node) {
          if (node.isListItem()) {
            let level = node.getLevel();
            let list = node.getParent();
            let listType = list.getListType(level);
            let active = listType === this.config.spec.listType;
            let action = active ? 'toggleList' : 'setListType';
            let listId = list.id;
            return {
              disabled: false,
              active,
              action,
              listId,
              level
            }
          } else if (node.isText()) {
            return {
              disabled: false,
              action: 'switchTextType'
            }
          }
        }
      }
      return { disabled: true }
    }

    /*
      Note: this implementation is still very coupled with the specific internal data model.
      TODO: we could try to use API to generalize this
    */
    execute (params) {
      let commandState = params.commandState;
      const { disabled, action } = commandState;
      if (disabled) return

      let editorSession = params.editorSession;
      switch (action) {
        case 'toggleList': {
          editorSession.transaction((tx) => {
            tx.toggleList();
          }, { action: 'toggleList' });
          break
        }
        case 'setListType': {
          const { listId, level } = commandState;
          editorSession.transaction((tx) => {
            let list = tx.get(listId);
            list.setListType(level, this.config.spec.listType);
          }, { action: 'setListType' });
          break
        }
        case 'switchTextType': {
          editorSession.transaction((tx) => {
            tx.toggleList({ listType: this.config.spec.listType });
          }, { action: 'toggleList' });
          break
        }
        default:
          //
      }
    }
  }

  class AbstractComponent extends NodeComponent {
    render ($$) {
      let el = $$('div').addClass('sc-abstract');
      el.append(
        this._renderValue($$, 'content', {
          placeholder: this.getLabel('abstract-placeholder')
        })
      );
      return el
    }
  }

  /*
    This is a proto component which allows you to render a file uploader
    with possible drop fuctionaluty.
    To use it you'll need to inherit this component as a parent and override
    handleUploadedFiles method to implement your own file handling strategy.
  */
  class FileUploadComponent extends substance.Component {
    get acceptedFiles () {
      return false
    }

    render ($$) {
      const el = $$('div').addClass('sc-file-upload');

      const selectInput = $$('input').attr({
        type: 'file'
      }).on('click', this._supressClickPropagation)
        .on('change', this._selectFile)
        .ref('input');

      if (this.acceptedFiles) {
        selectInput.attr({ accept: this.acceptedFiles });
      }

      // HACK: to place a link inside label we will use
      // another placeholder with a substring of first one
      const placeholder = this.getLabel('file-upload-placeholder');
      const selectPlaceholder = this.getLabel('file-upload-select-placeholder');
      const placeholderParts = placeholder.split(selectPlaceholder);

      const dropZone = $$('div').addClass('se-drop-import').append(
        placeholderParts[0],
        $$('span').addClass('se-select-trigger')
          .append(selectPlaceholder)
          .on('click', this._onClick),
        placeholderParts[1],
        selectInput
      ).on('drop', this._handleDrop)
        .on('dragstart', this._onDrag)
        .on('dragenter', this._onDrag)
        .on('dragend', this._onDrag);

      el.append(dropZone);

      if (this.state.error) {
        el.append(
          $$('div').addClass('se-error-popup').append(this.renderErrorsList($$))
        );
      }

      return el
    }

    renderErrorsList ($$) {
      return $$('ul').addClass('se-error-list').append(this.getLabel('file-upload-error'))
    }

    handleUploadedFiles (files) {
      throw new Error('This method is abstract')
    }

    _onClick () {
      this.refs.input.click();
    }

    _supressClickPropagation (e) {
      e.stopPropagation();
    }

    _selectFile (e) {
      const files = e.currentTarget.files;
      this.handleUploadedFiles(files);
    }

    _handleDrop (e) {
      const files = e.dataTransfer.files;
      this.handleUploadedFiles(files);
    }

    _onDrag (e) {
      // Stop event propagation for the dragstart and dragenter
      // events, to avoid editor drag manager errors
      e.stopPropagation();
    }
  }

  class SupplementaryFileUploadComponent extends FileUploadComponent {
    // NOTE: we are sending uploaded files up to the workflow component
    handleUploadedFiles (files) {
      if (files) {
        this.send('importFile', files);
      }
    }
  }

  class AddSupplementaryFileWorkflow extends substance.Component {
    static get desiredWidth () {
      return 'medium'
    }

    didMount () {
      super.didMount();

      this.handleActions({
        'importFile': this._onFileImport
      });
    }

    render ($$) {
      let el = $$('div').addClass('sc-add-supplementary-file sm-workflow');

      let Input = this.getComponent('input');
      let Button = this.getComponent('button');

      const title = $$('div').addClass('se-title').append(
        this.getLabel('supplementary-file-workflow-title')
      );

      const urlInput = $$(InputWithButton, {
        input: $$(Input, {
          placeholder: this.getLabel('supplementary-file-link-placeholder') }
        ).ref('urlInput'),
        button: $$(Button).append(
          this.getLabel('add-action')
        ).on('click', this._onExternalFileImport)
      });

      el.append(
        title,
        $$(DialogSectionComponent, { label: this.getLabel('supplementary-file-upload-label') })
          .append($$(SupplementaryFileUploadComponent)),
        $$(DialogSectionComponent, { label: this.getLabel('supplementary-file-link-label') })
          .append(urlInput)
      );

      return el
    }

    _onExternalFileImport () {
      const url = this.refs.urlInput.val();
      let api = this.context.api;
      api.insertSupplementaryFile(null, url);
      this.send('closeModal');
    }

    _onFileImport (files) {
      let api = this.context.api;
      api.insertSupplementaryFile(files[0]);
      this.send('closeModal');
    }
  }

  class AuthorsListComponent extends substance.CustomSurface {
    getInitialState () {
      let items = this._getAuthors();
      return {
        hidden: items.length === 0,
        edit: false
      }
    }

    didMount () {
      super.didMount();

      const appState = this.context.editorState;
      // FIXME: it is not good to rerender on every selection change.
      // Instead it should derive a state from the selection, and only rerender if the
      // state has changed (not-selected, selected + author id)
      appState.addObserver(['selection'], this.rerender, this, { stage: 'render' });
    }

    dispose () {
      super.dispose();
      this.context.editorState.removeObserver(this);
    }

    render ($$) {
      let el = $$('div').addClass('sc-authors-list');
      el.append(
        this._renderAuthors($$)
      );
      return el
    }

    _renderAuthors ($$) {
      const sel = this.context.editorState.selection;
      const authors = this._getAuthors();
      let els = [];
      authors.forEach((author, index) => {
        const authorEl = $$(AuthorDisplay, { node: author }).ref(author.id);
        if (sel && sel.nodeId === author.id) {
          authorEl.addClass('sm-selected');
        }
        els.push(authorEl);
        if (index < authors.length - 1) {
          els.push(', ');
        }
      });
      return els
    }

    _getCustomResourceId () {
      return 'authors-list'
    }

    _getAuthors () {
      return this.props.model.getItems()
    }
  }

  class AuthorDisplay extends NodeComponent {
    render ($$) {
      let el = $$('span').addClass('se-contrib').html(
        this.context.api.renderEntity(this.props.node)
      );
      el.on('mousedown', this._onMousedown)
        .on('click', this._onClick);
      return el
    }

    _onMousedown (e) {
      e.stopPropagation();
      if (e.button === 2) {
        this._select();
      }
    }

    _onClick (e) {
      e.stopPropagation();
      this._select();
    }

    _select () {
      this.context.api.selectEntity(this.props.node.id);
    }
  }

  class BlockFormulaEditor extends substance.Component {
    render ($$) {
      let el = $$('div').addClass('sc-block-formula-editor');
      const node = this.props.node;

      let TextPropertyEditor = this.getComponent('text-property-editor');
      let editor = $$(TextPropertyEditor, {
        path: [node.id, 'content'],
        placeholder: this.getLabel('enter-formula'),
        multiLine: true
      }).ref('input');
      editor.addClass('se-editor');
      el.append(editor);

      return el
    }
  }

  class PreviewComponent extends substance.Component {
    getChildContext () {
      return {
        editable: false
      }
    }

    render ($$) {
      let id = this.props.id;
      let el = $$('div')
        .addClass('sc-preview')
        .attr({ 'data-id': id });

      if (this.props.thumbnail) {
        el.append(
          $$('div').addClass('se-thumbnail').append(
            this.props.thumbnail
          )
        );
      }

      el.append(
        $$('div').addClass('se-label').append(
          this.props.label
        ),
        // NOTE: description is passed in as HTML string
        $$('div').addClass('se-description').append(
          this.props.description
        )
      );
      return el
    }
  }

  class BlockFormulaComponent extends NodeOverlayEditorMixin(NodeComponent) {
    getInitialState () {
      return this._deriveState(this.props, {})
    }

    willUpdateProps (newProps) {
      this.setState(this._deriveState(newProps));
    }

    render ($$) {
      const mode = this.props.mode;
      const node = this.props.node;
      const label = getLabel(node) || '?';
      const source = node.content;
      const state = this.state;

      if (mode === PREVIEW_MODE) {
        let description = $$('div').html(state.html);
        if (state.error) description.addClass('sm-error');
        return $$(PreviewComponent, {
          id: node.id,
          label,
          description
        })
      }

      let el = $$('div')
        .addClass('sc-block-formula')
        .attr('data-id', node.id);

      let content = $$('div').addClass('se-content');
      if (!source) {
        content.append('?');
      } else {
        content.append(
          $$('div').addClass('se-formula').html(state.html || state.lastHtml)
        );
      }
      content.append(
        $$('div').addClass('se-label').append(label)
      );

      el.append(
        content
      );

      if (this.state.error) {
        el.addClass('sm-error');
        el.append(
          $$('div').addClass('se-error').text(this.state.error.message)
        );
      }

      // TODO: what is this for?
      el.append($$('div').addClass('se-blocker'));

      return el
    }

    _onNodeUpdate () {
      this.setState(this._deriveState(this.props, this.state));
    }

    _deriveState (props, oldState) {
      try {
        let html = katex.renderToString(props.node.content);
        return { html, lastHtml: html }
      } catch (error) {
        return {
          error,
          html: '',
          lastHtml: oldState.lastHtml
        }
      }
    }

    _getEditorClass () {
      return BlockFormulaEditor
    }

    _shouldEnableOverlayEditor () {
      return this.props.mode !== PREVIEW_MODE
    }
  }

  class BlockQuoteComponent extends NodeComponent {
    render ($$) {
      let node = this.props.node;
      let el = $$('div')
        .addClass('sc-block-quote')
        .attr('data-id', node.id);

      el.append(
        this._renderValue($$, 'content', { placeholder: this.getLabel('content-placeholder') }),
        this._renderValue($$, 'attrib', { placeholder: this.getLabel('attribution-placeholder') })
      );
      return el
    }
  }

  class BoldComponent extends substance.AnnotationComponent {
    getTagName () {
      return 'b'
    }
  }

  class BreakComponent extends substance.Component {
    render ($$) {
      return $$('br')
    }
  }

  /**
   * A component that renders a node in a generic way iterating all properties.
   */
  class DefaultNodeComponent extends substance.Component {
    didMount () {
      // EXPERIMENTAL: ExperimentalArticleValidator updates `node.id, @issues`
      const node = this._getNode();
      this.context.editorState.addObserver(['document'], this._rerenderWhenIssueHaveChanged, this, {
        stage: 'render',
        document: {
          path: [node.id, '@issues']
        }
      });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    getInitialState () {
      return {
        showAllFields: false
      }
    }

    render ($$) {
      const showAllFields = this.state.showAllFields;
      const node = this._getNode();
      // TODO: issues should be accessed via model, not directly
      const nodeIssues = node['@issues'];
      let hasIssues = (nodeIssues && nodeIssues.size > 0);
      const el = $$('div').addClass(this._getClassNames()).attr('data-id', node.id);
      // EXPERIMENTAL: highlighting fields with issues
      if (hasIssues) {
        el.addClass('sm-warning');
      }
      el.append(this._renderHeader($$));

      const properties = this._getProperties();
      const propNames = Array.from(properties.keys());
      // all required and non-empty properties are always displayed
      let mandatoryPropNames = this._getRequiredOrNonEmptyPropertyNames(properties);
      let visiblePropNames = showAllFields ? propNames : mandatoryPropNames;
      // show only the first k items
      if (visiblePropNames.length === 0) {
        visiblePropNames = propNames.slice(0, CARD_MINIMUM_FIELDS);
      }
      let hasHiddenProps = mandatoryPropNames.length < propNames.length;

      for (let name of visiblePropNames) {
        let value = properties.get(name);
        el.append(
          this._renderProperty($$, name, value, nodeIssues)
        );
      }

      const footer = $$('div').addClass('se-footer');

      // Note: only showing a button to toggle display of optional fields
      // when there are hidden fields
      if (hasHiddenProps) {
        const controlEl = $$('div').addClass('se-control')
          .on('click', this._toggleMode);
        if (showAllFields) {
          controlEl.append(
            $$(substance.FontAwesomeIcon, { icon: 'fa-chevron-up' }).addClass('se-icon'),
            this.getLabel('show-less-fields')
          ).addClass('sm-show-less-fields');
        } else {
          controlEl.append(
            $$(substance.FontAwesomeIcon, { icon: 'fa-chevron-down' }).addClass('se-icon'),
            this.getLabel('show-more-fields')
          ).addClass('sm-show-more-fields');
        }
        footer.append(
          controlEl
        );
      }

      el.append(footer);

      return el
    }

    _renderProperty ($$, name, value, nodeIssues) {
      const PropertyEditor = this._getPropertyEditorClass(name, value);
      const editorProps = this._getPropertyEditorProps(name, value);
      // skip this property if the editor implementation produces nil
      if (PropertyEditor) {
        const issues = nodeIssues ? nodeIssues.get(name) : [];
        return $$(FormRowComponent, {
          label: editorProps.label,
          issues
        }).addClass(`sm-${name}`).append(
          $$(PropertyEditor, editorProps).ref(name)
        )
      }
    }

    _getNode () {
      return this.props.node
    }

    _getProperties () {
      if (!this._properties) {
        this._properties = this._createPropertyModels();
      }
      return this._properties
    }

    _createPropertyModels () {
      return createNodePropertyModels(this.context.api, this._getNode())
    }

    _getClassNames () {
      return `sc-default-model sm-${this._getNode().type}`
    }

    _renderHeader ($$) {
      // TODO: rethink this. IMO it is not possible to generalize this implementation.
      // Maybe it is better to just use the regular component and pass a prop to allow the component to render in a 'short' style
      const ModelPreviewComponent = this.getComponent('model-preview', true);
      const node = this._getNode();
      let header = $$('div').addClass('se-header');
      if (ModelPreviewComponent) {
        header.append(
          $$(ModelPreviewComponent, { node })
        );
      }
      return header
    }

    /*
      Can be overriden to specify for which properties, labels should be hidden.
    */
    _showLabelForProperty (prop) {
      return true
    }

    // TODO: get rid of this
    get isRemovable () {
      return true
    }

    _getPropertyEditorClass (name, value) {
      return this.getComponent(value.type)
    }

    _getPropertyEditorProps (name, value) {
      let props = {
        // TODO: rename to value
        model: value,
        placeholder: this._getPlaceHolder(name)
      };
      if (this._showLabelForProperty(name)) {
        props.label = this.getLabel(name);
      }
      // TODO: is this really what we want? i.e. every CHILDREN value
      // is rendered as a container?
      if (value.type === 'collection') {
        props.container = true;
      }
      return props
    }

    _getPlaceHolder (name) {
      // ATTENTION: usually we avoid using automatically derived labels
      // but this class is all about a automated rendereding
      let placeHolder;
      // first try to get the canonical label
      const canonicalLabel = `${name}-placeholder`;
      placeHolder = this.getLabel(canonicalLabel);
      // next try to get a label using a template 'Enter ${something}'
      if (placeHolder === canonicalLabel) {
        let nameLabel = this.getLabel(name);
        if (nameLabel) {
          placeHolder = this.getLabel('enter-something', { something: nameLabel });
        } else {
          console.warn(`Please define a label for key "${name}"`);
        }
      }
      return placeHolder
    }

    _getRequiredOrNonEmptyPropertyNames (properties) {
      const api = this.context.api;
      let result = new Set();
      for (let [name, value] of properties) {
        if (!value.isEmpty() || api._isFieldRequired(value._getPropertySelector())) {
          result.add(name);
        }
      }
      return Array.from(result)
    }

    _toggleMode () {
      const showAllFields = this.state.showAllFields;
      this.extendState({ showAllFields: !showAllFields });
    }

    _rerenderWhenIssueHaveChanged () {
      // console.log('Rerendering NodeModelCompent after issues have changed', this._getNode().id)
      this.rerender();
    }
  }

  /*
    Converts a CSLJSON record to our internal format.
    See EntityDatabase for schemas.
  */

  function convertCSLJSON (source) {
    let bibType = source.type;
    let result;

    // CSL types: http://docs.citationstyles.org/en/stable/specification.html#appendix-iii-types
    let typeMapping = {
      'article': ARTICLE_REF,
      'article-magazine': MAGAZINE_ARTICLE_REF,
      'article-newspaper': NEWSPAPER_ARTICLE_REF,
      'article-journal': JOURNAL_ARTICLE_REF,
      'journal-article': JOURNAL_ARTICLE_REF,
      // "bill"
      'book': BOOK_REF,
      // "broadcast"
      'chapter': CHAPTER_REF,
      'dataset': DATA_PUBLICATION_REF,
      // "entry"
      'entry-dictionary': BOOK_REF,
      'entry-encyclopedia': BOOK_REF,
      // "figure"
      // "graphic"
      // "interview"
      // "legislation"
      // "legal_case"
      // "manuscript"
      // "map"
      // "motion_picture"
      // "musical_score"
      // "pamphlet"
      'paper-conference': CONFERENCE_PAPER_REF,
      'patent': PATENT_REF,
      // "post"
      // "post-weblog"
      // "personal_communication"
      'report': REPORT_REF,
      // "review"
      // "review-book"
      // "song"
      // "speech"
      'thesis': THESIS_REF,
      // "treaty"
      'webpage': WEBPAGE_REF
      // NA : "software"
    };

    if (typeMapping[bibType]) {
      result = _convertFromCSLJSON(source, typeMapping[bibType]);
    } else {
      throw new Error(`Bib type ${bibType} not yet supported`)
    }
    return result
  }

  function _convertFromCSLJSON (source, type) {
    const date = _extractDateFromCSLJSON(source);

    let data = {
      type: type,

      title: source.title,
      containerTitle: source['container-title'],
      volume: source.volume,
      issue: source.issue,
      pageRange: source.page,
      doi: source.DOI,
      pmid: source.PMID,

      edition: source.edition,
      publisherLoc: source['publisher-place'],
      publisherName: source.publisher,
      pageCount: source['number-of-pages'],
      partTitle: source.section,
      confName: source.event,
      confLoc: source['event-place'],
      isbn: source.ISBN,

      year: date.year,
      month: date.month,
      day: date.day,

      uri: source.URL,
      version: source.version

      /* Examples with no corresponding field:
          - abstract
          - accessed
          - composer
          - director
          - ISSN
          - language
          - number-of-volumes
          - PMCID
          - title-short
          - translator
      */
    };

    // series
    if (source['collection-title']) {
      data.series = source['collection-title'];
      if (source['collection-number']) {
        data.series += '; ' + source['collection-number'];
      }
    }

    // Authors, editors, translators, inventors
    if (source.author) {
      if (type === 'patent') {
        data.inventors = source.author.map(a => { return { name: a.family, givenNames: a.given, type: 'ref-contrib' } });
      } else {
        data.authors = source.author.map(a => { return { name: a.family, givenNames: a.given, type: 'ref-contrib' } });
      }
    }
    if (source.editor) {
      data.editors = source.editor.map(a => { return { name: a.family, givenNames: a.given, type: 'ref-contrib' } });
    }
    if (source.translator) {
      data.translators = source.translator.map(a => { return { name: a.family, givenNames: a.given, type: 'ref-contrib' } });
    }

    // Cleanup output to avoid any undefined values
    Object.keys(data).forEach(key => {
      if (data[key] === undefined) {
        delete data[key];
      }
    });

    if (!data.doi) {
      // TODO: We should not rely that the imported item has a DOI, because it can also be imported from a generic CSL JSON file.
      //  However, there are some problems in the further processing withouth a DOI at the moment...
      throw new Error(`Citation must have DOI.`)
    }

    return data
  }

  function _extractDateFromCSLJSON (source) {
    let date = {};
    if (source.issued && source.issued['date-parts']) {
      let CSLdate = source.issued['date-parts'];
      if (CSLdate.length > 0) {
        date.year = String(CSLdate[0][0]);
        if (CSLdate[0][1]) {
          date.month = CSLdate[0][1] > 9 ? String(CSLdate[0][1]) : 0 + String(CSLdate[0][1]);
        }
        if (CSLdate[0][2]) {
          date.day = CSLdate[0][2] > 9 ? String(CSLdate[0][2]) : 0 + String(CSLdate[0][2]);
        }
      }
    }
    return date
  }

  class QueryComponent extends substance.Component {
    render ($$) {
      let Input = this.getComponent('input');

      const btnEl = $$('button').addClass('se-action');

      if (this.props.loading) {
        btnEl.append(
          this._renderIcon($$, 'input-loading')
        );
      } else if (this.props.errors) {
        btnEl.append(
          this._renderIcon($$, 'input-error')
        );
      } else {
        btnEl.append(
          this.getLabel(this.props.actionLabel)
        ).on('click', this._onQuery);
      }

      let el = $$('div').addClass('sc-query').append(
        $$(InputWithButton, {
          input: $$(Input).attr({
            type: 'text',
            placeholder: this.getLabel(this.props.placeholder)
          }).ref('input').on('input', this._unblockUI),
          button: btnEl
        })
      );

      if (this.props.errors) {
        el.addClass('sm-error').append(
          $$('div').addClass('se-error-popup').append(
            $$('ul').addClass('se-error-list')
              .append(this.props.errors.map(err => $$('li').append(err)))
          )
        );
      }

      return el
    }

    _renderIcon ($$, icon) {
      return $$('div').addClass('se-icon').append(
        this.context.iconProvider.renderIcon($$, icon)
      )
    }

    _onQuery () {
      const input = this.refs.input;
      const val = input.val();
      if (val) this.send('query', val);
    }

    _unblockUI () {
      if (this.props.errors) {
        this.extendProps({ errors: undefined });
      }
    }
  }

  class DOIInputComponent extends substance.Component {
    constructor (...args) {
      super(...args);
      this.handleActions({
        'query': this._startImporting
      });
    }

    getInitialState () {
      return {
        loading: false
      }
    }

    render ($$) {
      return $$('div').addClass('sc-doi-input').append(
        $$(QueryComponent, {
          placeholder: 'enter-doi-placeholder',
          actionLabel: 'add-action',
          loading: this.state.loading,
          errors: this.state.errors
        })
      )
    }

    async _startImporting (input) {
      const dois = input.split(' ').map(v => v.trim()).filter(v => Boolean(v));
      this.extendState({ loading: true });

      try {
        const entries = await _getBibEntries(dois);
        this.send('importBib', entries);
      } catch (error) {
        const dois = error.dois;
        const errorMessage = error.message;
        let errors = [
          errorMessage
        ];
        errors = errors.concat(dois.map(d => '- ' + d));
        this.extendState({ errors, loading: false });
      }
    }
  }

  /*
    Helpers
  */
  const ENDPOINT = 'https://doi.org/';

  function _getBibEntries (dois) {
    return _fetchCSLJSONEntries(dois).then(entries => {
      let conversionErrors = [];
      let convertedEntries = [];
      entries.forEach(entry => {
        try {
          convertedEntries.push(
            convertCSLJSON(entry)
          );
        } catch (error) {
          conversionErrors.push(entry.DOI);
        }
      });
      if (conversionErrors.length > 0) {
        let error = new Error('Conversion error');
        error.dois = conversionErrors;
        return Promise.reject(error)
      } else {
        return convertedEntries
      }
    })
  }

  /*
    Fetch CSL JSON entries
  */
  function _fetchCSLJSONEntries (dois) {
    let errored = [];
    let entries = [];

    return dois.reduce((promise, doi) => {
      return promise
        .then(() => _fetchDOI(doi))
        .then(csl => entries.push(JSON.parse(csl)))
        .catch(() => errored.push(doi))
    }, Promise.resolve())
      .then(() => {
        if (errored.length > 0) {
          let err = new Error(`Could not resolve some DOI's`);
          err.dois = errored;
          throw err
        } else {
          return entries
        }
      })
  }

  /*
    Fetch single entry for DOI
  */
  function _fetchDOI (doi) {
    // ATTENTION: sendRequest uses XMLHTTPRequest, thus make sure to call it only in the browser
    if (substance.platform.inBrowser) {
      const url = ENDPOINT + doi;
      return substance.sendRequest({ url: url, method: 'GET', header: { 'accept': 'application/vnd.citationstyles.csl+json' } })
    } else {
      return Promise.resolve('{}')
    }
  }

  class DownloadSupplementaryFileTool extends Tool {
    render ($$) {
      let el = super.render($$);
      let link = $$('a').ref('link')
        // ATTENTION: stop propagation, otherwise infinite loop
        .on('click', substance.domHelpers.stop);

      // Downloading is a bit involved:
      // In electron, everything can be done with one solution,
      // handling a 'will-download' event, which is triggered when the `download`
      // attribute is present.
      // For the browser, the `download` attribute works only for files from the same
      // origin. For remote files the best we can do at the moment, is opening
      // a new tab, and let the browser deal with it.
      // TODO: if this feature is important, one idea is that the DAR server could
      // provide an end-point to provide download-urls, and act as a proxy to
      // cirvumvent the CORS problem.
      const isLocal = this._isLocal();
      if (substance.platform.inElectron || isLocal) {
        link.attr('download', '');
      } else {
        link.attr('target', '_blank');
      }

      el.append(link);
      return el
    }

    getClassNames () {
      return 'sc-download-supplementary-file-tool sc-tool'
    }

    _onClick (e) {
      e.stopPropagation();
      e.preventDefault();
      this._triggerDownload();
    }

    _triggerDownload () {
      const archive = this.context.archive;
      const node = this._getNode();
      const isLocal = this._isLocal();
      let url = node.href;
      if (isLocal) {
        url = archive.getDownloadLink(node.href);
      }
      if (url) {
        this.refs.link.el.attr({
          'href': url
        });
        this.refs.link.el.click();
      }
    }

    _getNode () {
      return this.props.commandState.node
    }

    _isLocal () {
      let node = this._getNode();
      return (!node || !node.remote)
    }
  }

  // Base-class for Manuscript- and MetadataEditor to reduced code-redundancy
  class EditorPanel extends substance.Component {
    constructor (...args) {
      super(...args);

      this._initialize(this.props);
    }

    // EXPERIMENTAL: Editor interface to be able to access the root element of editable content
    getContentPanel () {
      return this.refs.contentPanel
    }

    // TODO: shouldn't we react on willReceiveProps?
    _initialize (props) {
      const { editorSession } = props;
      const config = this.context.config;
      const context = Object.assign(this.context, substance.createEditorContext(config, editorSession, this), {
        editable: true
      });
      this.context = context;
    }

    _restoreViewport () {
      if (this.props.viewport) {
        // console.log('Restoring viewport', this.props.viewport)
        this.refs.contentPanel.setScrollPosition(this.props.viewport.x);
      }
    }

    dispose () {
      const appState = this.context.editorState;
      const editorSession = this._getEditorSession();
      editorSession.dispose();
      appState.removeObserver(this);
      this.props.archive.off(this);
    }

    getComponentRegistry () {
      return this.props.config.getComponentRegistry()
    }

    _getConfigurator () {
      return this.props.config
    }

    _getContentPanel () {
      /* istanbul ignore next */
      throw new Error('This method is abstract')
    }

    _getDocument () {
      return this._getEditorSession().getDocument()
    }

    _getEditorSession () {
      return this.props.editorSession
    }

    _getTheme () {
      // TODO: this should come from app settings
      return 'light'
    }

    _onKeydown (e) {
      // console.log('EditorPanel._onKeydown', e)
      let handled = false;
      const appState = this.context.editorState;
      switch (e.keyCode) {
        case substance.keys.ESCAPE: {
          if (appState.findAndReplace.enabled) {
            this.context.findAndReplaceManager.closeDialog();
            handled = true;
          }
          break
        }
        default:
          //
      }
      if (!handled) {
        handled = this.context.keyboardManager.onKeydown(e, this.context);
      }
      if (handled) {
        e.stopPropagation();
        e.preventDefault();
      }
      return handled
    }

    _renderWorkflow ($$, workflowId) {
      let workflowProps = this.context.editorState.workflowProps || {};
      let Modal = this.getComponent('modal');
      let WorkflowComponent = this.getComponent(workflowId);
      return $$(Modal, {
        width: WorkflowComponent.desiredWidth,
        content: $$(WorkflowComponent, workflowProps).ref('workflow')
      }).addClass('se-workflow-modal sm-workflow-' + workflowId)
    }

    _scrollElementIntoView (el, force) {
      this._getContentPanel().scrollElementIntoView(el, !force);
    }

    // used for scrolling when clicking on TOC entries
    _scrollTo (params) {
      let selector;
      if (params.nodeId) {
        selector = `[data-id="${params.nodeId}"]`;
      } else if (params.section) {
        selector = `[data-section="${params.section}"]`;
      } else {
        throw new Error('Illegal argument')
      }
      let comp = this.refs.contentPanel.find(selector);
      if (comp) {
        this._scrollElementIntoView(comp.el, true);
      }
      this.send('updateRoute', params);
    }
  }

  /**
   * Used in the popup when cursor is on an external-link.
   */
  class ExternalLinkEditor extends substance.Component {
    render ($$) {
      let TextPropertyEditor = this.getComponent('text-property-editor');
      let Button = this.getComponent('button');
      let el = $$('div').addClass('sc-external-link-editor').addClass('sm-horizontal-layout');
      let node = this.props.node;

      let hrefEditor = $$(TextPropertyEditor, {
        path: [node.id, 'href'],
        placeholder: 'Paste or type a link url'
      }).ref('input')
        .addClass('se-href')
        .addClass('sm-monospace');

      let openLinkButton = $$(Button, {
        icon: 'open-link',
        theme: this.props.theme
      }).addClass('sm-open')
        .attr('title', this.getLabel('open-link'))
        .on('click', this._openLink);

      el.append(
        hrefEditor,
        openLinkButton
      );
      return el
    }

    _openLink () {
      let url = this.props.node.href;
      // FIXME: this is not the way how it should be done
      // instead we should send up an action 'open-url'
      // and let the ApplicationChrome do it.
      window.open(url, '_blank');
    }
  }

  class ExternalLinkComponent extends EditableAnnotationComponent {
    render ($$) {
      let node = this.props.node;
      return super.render($$).attr('href', node.href).addClass('sc-external-link')
    }

    getTagName () {
      return 'a'
    }

    _getEditorClass () {
      return ExternalLinkEditor
    }
  }

  class FigureComponent extends NodeComponent {
    /*
      Note: in the Manuscript View only one figure panel is shown at time.
    */
    render ($$) {
      let mode = this._getMode();
      let node = this.props.node;
      let panels = node.panels;

      let el = $$('div').addClass('sc-figure').addClass(`sm-${mode}`).attr('data-id', node.id);
      if (panels.length > 0) {
        let content = this._renderCarousel($$, panels);
        el.append(content);
      }
      return el
    }

    _renderCarousel ($$, panels) {
      if (panels.length === 1) {
        return this._renderCurrentPanel($$)
      } else {
        return $$('div').addClass('se-carousel').append(
          this._renderNavigation($$),
          $$('div').addClass('se-current-panel').append(
            this._renderCurrentPanel($$)
          )
        )
      }
    }

    _renderCurrentPanel ($$) {
      let panel = this._getCurrentPanel();
      let PanelComponent = this.getComponent(panel.type);
      return $$(PanelComponent, {
        node: panel,
        mode: this.props.mode
      }).ref(panel.id)
    }

    _renderNavigation ($$) {
      const node = this.props.node;
      const panels = node.getPanels();
      const numberOfPanels = panels.length;
      const currentIndex = this._getCurrentPanelIndex() + 1;
      const currentPosition = currentIndex + ' / ' + numberOfPanels;
      const leftControl = $$('div').addClass('se-control sm-previous').append(
        this._renderIcon($$, 'left-control')
      );
      if (currentIndex > 1) {
        leftControl.on('click', this._onSwitchPanel.bind(this, 'left'));
      } else {
        leftControl.addClass('sm-disabled');
      }
      const rightControl = $$('div').addClass('se-control sm-next').append(this._renderIcon($$, 'right-control'));
      if (currentIndex < numberOfPanels) {
        rightControl.on('click', this._onSwitchPanel.bind(this, 'right'));
      } else {
        rightControl.addClass('sm-disabled');
      }
      return $$('div').addClass('se-navigation').append(
        $$('div').addClass('se-current-position').append(currentPosition),
        $$('div').addClass('se-controls').append(
          leftControl,
          rightControl
        )
      )
    }

    _getMode () {
      return this.props.mode || 'manuscript'
    }

    _getCurrentPanel () {
      let node = this.props.node;
      let doc = node.getDocument();
      let currentPanelIndex = this._getCurrentPanelIndex();
      let ids = node.panels;
      return doc.get(ids[currentPanelIndex])
    }

    _getCurrentPanelIndex () {
      let node = this.props.node;
      let state = node.state;
      let panels = node.panels;
      let currentPanelIndex = 0;
      if (state) {
        currentPanelIndex = state.currentPanelIndex;
      }
      // FIXME: state is corrupt
      if (currentPanelIndex < 0 || currentPanelIndex >= panels.length) {
        console.error('figurePanel.state.currentPanelIndex is corrupt');
        state.currentPanelIndex = currentPanelIndex = 0;
      }
      return currentPanelIndex
    }

    _onSwitchPanel (direction) {
      let currentIndex = this._getCurrentPanelIndex();
      this.context.api.switchFigurePanel(this.props.node, direction === 'left' ? --currentIndex : ++currentIndex);
    }

    _renderIcon ($$, iconName) {
      return $$('div').addClass('se-icon').append(
        this.context.iconProvider.renderIcon($$, iconName)
      )
    }
  }

  class FigureMetadataComponent extends ValueComponent {
    render ($$) {
      let items = this.props.model.getItems();
      let el = $$('div').addClass('sc-figure-metadata');
      if (items.length > 0) {
        el.append(
          items.map(field => this._renderMetadataField($$, field))
        );
      } else {
        el.addClass('sm-empty').append(this.getLabel('empty-figure-metadata'));
      }
      return el
    }

    _renderMetadataField ($$, metadataField) {
      let MetadataFieldComponent = this.getComponent(metadataField.type);
      return $$(MetadataFieldComponent, { node: metadataField }).ref(metadataField.id)
    }
  }

  class DropdownEditor extends ValueComponent {
    render ($$) {
      const model = this.props.model;
      const value = model.getValue();
      let el = $$('div').addClass(this._getClassNames());

      const dropdownSelector = $$('select').ref('input').addClass('se-select')
        .val(value)
        .on('click', substance.domHelpers.stop)
        .on('change', this._setValue);

      dropdownSelector.append(
        $$('option').append(this._getLabel())
      );

      this._getValues().forEach(l => {
        const option = $$('option').attr({ value: l.id }).append(l.name);
        if (l.id === value) option.attr({ selected: 'selected' });
        dropdownSelector.append(option);
      });

      el.append(dropdownSelector);

      return el
    }

    _getClassNames () {
      return 'sc-dropdown-editor'
    }

    _getLabel () {
      return this.getLabel('select-value')
    }

    _getValues () {
      return []
    }

    _setValue () {
      const model = this.props.model;
      const input = this.refs.input;
      const value = input.getValue();
      model.setValue(value);
    }
  }

  class LicenseEditor extends DropdownEditor {
    _getLabel () {
      return this.getLabel('select-license')
    }

    _getValues () {
      return LICENSES
    }
  }

  class FigurePanelComponentWithMetadata extends DefaultNodeComponent {
    _getClassNames () {
      return `sc-figure-metadata sc-default-node`
    }

    _renderHeader ($$) {
      const node = this.props.node;
      let header = $$('div').addClass('se-header');
      header.append(
        $$('div').addClass('se-label').text(getLabel(node))
      );
      return header
    }

    // overriding this to get spawn a special editor for the content
    _getPropertyEditorClass (name, value) {
      // skip 'label' here, as it is shown 'read-only' in the header instead
      if (name === 'label') {
        return null
      // special editor to pick license type
      } else if (name === 'license') {
        return LicenseEditor
      } else if (name === 'metadata') {
        return FigureMetadataComponent
      } else {
        return super._getPropertyEditorClass(name, value)
      }
    }

    _createPropertyModels () {
      const api = this.context.api;
      const node = this.props.node;
      const doc = node.getDocument();
      // ATTENTION: we want to show permission properties like they were fields of the panel itself
      // for that reason we are creating a property map where the permission fields are merged in
      return createNodePropertyModels(api, this.props.node, {
        // EXPERIMENTAL: trying to allow
        'permission': () => {
          let permission = doc.get(node.permission);
          return createNodePropertyModels(api, permission)
        }
      })
    }

    _showLabelForProperty (prop) {
      // Don't render a label for content property to use up the full width
      if (prop === 'content') {
        return false
      }
      return true
    }
  }

  // TODO: we need to rethink how we model labels
  // ATM, we have it in the schema, but we are using node state
  class LabelComponent extends substance.Component {
    didMount () {
      this.context.editorState.addObserver(['document'], this.rerender, this, { stage: 'render', document: { path: [this.props.node.id] } });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    render ($$) {
      const label = getLabel(this.props.node);
      return $$('div').addClass('sc-label').text(label)
    }
  }

  class FigurePanelComponent extends NodeComponent {
    render ($$) {
      const mode = this._getMode();
      // different rendering when rendered as preview or in metadata view
      if (mode === PREVIEW_MODE) {
        return this._renderPreviewVersion($$)
      } else if (mode === METADATA_MODE) {
        return this._renderMetadataVersion($$)
      } else {
        return this._renderManuscriptVersion($$)
      }
    }

    _getClassNames () {
      return `sc-figure-panel`
    }

    _renderManuscriptVersion ($$) {
      const mode = this._getMode();
      const node = this.props.node;
      const SectionLabel = this.getComponent('section-label');

      let el = $$('div')
        .addClass(this._getClassNames())
        .attr('data-id', node.id)
        .addClass(`sm-${mode}`);

      el.append(
        $$(SectionLabel, { label: 'label-label' }),
        $$(LabelComponent, { node }),
        // no label for the graphic
        this._renderContent($$),
        $$(SectionLabel, { label: 'title-label' }),
        this._renderValue($$, 'title', { placeholder: this.getLabel('title-placeholder') }).addClass('se-title'),
        $$(SectionLabel, { label: 'legend-label' }),
        this._renderValue($$, 'legend', { placeholder: this.getLabel('legend-placeholder') }).addClass('se-legend')
      );

      // TODO: this is problematic as this node does not necessarily rerender if node.metadata has changed
      // the right way is to use a ModelComponent or use an incremental updater
      // rerender the whole component on metadata changes is not good, as it leads to double rerender, because FigureMetadataComponent reacts too
      if (node.metadata.length > 0) {
        el.append(
          $$(SectionLabel, { label: 'metadata-label' }),
          $$(FigureMetadataComponent, { model: createValueModel(this.context.api, [node.id, 'metadata']) })
        );
      }

      return el
    }

    _renderContent ($$) {
      return this._renderValue($$, 'content').addClass('se-content')
    }

    _renderPreviewVersion ($$) {
      const node = this.props.node;
      // TODO: We could return the PreviewComponent directly.
      // However this yields an error we need to investigate.
      let thumbnail;
      let content = node.getContent();
      if (content.type === 'graphic') {
        let ContentComponent = this.getComponent(content.type);
        thumbnail = $$(ContentComponent, {
          node: content
        });
      }
      // TODO: PreviewComponent should work with a model
      // FIXME: there is problem with redirected components
      // and Component as props
      return $$('div').append($$(PreviewComponent, {
        id: node.id,
        thumbnail,
        label: getLabel(node)
      })).addClass('sc-figure-panel').attr('data-id', node.id)
    }

    _renderMetadataVersion ($$) {
      return $$(FigurePanelComponentWithMetadata, { node: this.props.node })
    }

    _getMode () {
      return this.props.mode || 'manuscript'
    }
  }

  class FootnoteComponent extends NodeComponent {
    render ($$) {
      const mode = this.props.mode;
      if (mode === PREVIEW_MODE) {
        return this._renderPreviewVersion($$)
      }

      const footnote = this.props.node;
      let label = getLabel(footnote) || '?';

      let el = $$('div').addClass('sc-footnote').attr('data-id', footnote.id);
      el.append(
        $$('div').addClass('se-container').append(
          $$('div').addClass('se-label').append(label),
          this._renderValue($$, 'content', { placeholder: this.getLabel('footnote-placeholder') })
        )
      );
      return el
    }

    _renderPreviewVersion ($$) {
      let footnote = this.props.node;
      let el = $$('div').addClass('sc-footnote').attr('data-id', footnote.id);

      let label = getLabel(footnote) || '?';
      el.append(
        $$(PreviewComponent, {
          id: footnote.id,
          label: label,
          description: this._renderValue($$, 'content', {
            // TODO: we should need to pass down 'disabled' manually
            // editable=false should be disabled per-se
            disabled: true,
            editable: false
          })
        })
      );
      return el
    }
  }

  // TODO: do we need this anymore?
  class FootnoteEditor extends ValueComponent {
    render ($$) {
      return $$('div').addClass('sc-table-footnotes-editor').append(
        this._renderFootnotes($$)
      )
    }

    _renderFootnotes ($$) {
      const model = this.props.model;
      let items = model.getItems();
      return items.map(item => $$(FootnoteComponent, { node: item }).ref(item.id))
    }
  }

  class GraphicComponent extends NodeComponent {
    render ($$) {
      const node = this.props.node;
      const urlResolver = this.context.urlResolver;
      let url = node.href;
      if (urlResolver) {
        url = urlResolver.resolveUrl(url);
      }

      let el = $$(this.tagName).addClass(this._getClassNames())
        .attr('data-id', node.id);
      if (this.state.errored) {
        let errorEl = $$(this.tagName).addClass('se-error').append(
          this.context.iconProvider.renderIcon($$, 'graphic-load-error').addClass('se-icon')
        );
        this._renderError($$, errorEl);
        el.append(errorEl);
      } else {
        el.append(
          $$('img').attr({ src: url })
            .on('error', this._onLoadError)
        );
      }
      return el
    }

    _renderError ($$, errorEl) {
      errorEl.append(
        this.getLabel('graphic-load-error')
      );
    }

    _getClassNames () {
      return 'sc-graphic'
    }

    get tagName () {
      return 'div'
    }

    _onLoadError () {
      this.extendState({ errored: true });
    }
  }

  class HeadingComponent extends TextNodeComponent {
    didMount () {
      this.context.editorState.addObserver(['document'], this.rerender, this, {
        stage: 'render',
        document: { path: [this.props.node.id] }
      });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    getClassNames () {
      return 'sc-heading sc-text-node'
    }

    getTagName () {
      return 'h' + this.props.node.level
    }
  }

  /**
   * Tool to edit the markup of an InlineFormula.
   */
  class InlineFormulaEditor extends substance.Component {
    render ($$) {
      const TextPropertyEditor = this.getComponent('text-property-editor');
      const node = this.props.node;
      let el = $$('div').addClass('sc-inline-formula-editor').addClass('sm-horizontal-layout');
      let contentEditor = $$(TextPropertyEditor, {
        type: 'text',
        path: [node.id, 'content'],
        placeholder: this.getLabel('enter-formula')
      }).ref('editor')
        .addClass('sm-monospace');
      el.append(
        contentEditor
      );
      return el
    }
  }

  class InlineFormulaComponent extends EditableInlineNodeComponent {
    // ATTENTION: this is very similar to BlockFormulaComponent
    // but unfortunately also substantially different
    // e.g. has no blocker, elements are spans, error message as tooltip
    render ($$) {
      const node = this.props.node;
      let el = super.render($$)
        .addClass('sc-inline-formula');
      let source = node.content;
      if (!source) {
        el.append('?');
      } else {
        try {
          el.append(
            $$('span').addClass('se-formula').html(katex.renderToString(source))
          );
        } catch (error) {
          el.addClass('sm-error')
            .append('\u26A0')
            .append($$('span').addClass('se-message').text(error.message));
        }
      }
      return el
    }

    _getEditorClass () {
      return InlineFormulaEditor
    }
  }

  class InlineGraphicComponent extends GraphicComponent {
    get tagName () { return 'span' }

    _getClassNames () {
      return 'sc-inline-graphic'
    }

    _renderError ($$, errorEl) {
      errorEl.attr('title', this.getLabel('graphic-load-error'));
    }
  }

  class UploadTool extends Tool {
    // In addition to the regular button a file input is rendered
    // which is used to trigger the browser's file dialog.
    render ($$) {
      let el = super.render($$);

      const isMultiple = this.canUploadMultiple;
      const input = $$('input').attr({
        'type': 'file'
      }).ref('input')
        .on('change', this.onFileSelect)
        // ATTENTION: it is important to stop click events on the input
        // as otherwise Tools click handler will be triggered again
        .on('click', substance.domHelpers.stop);
      if (!this.doesAcceptAllFileTypes) {
        const fileType = this.getFileType();
        input.attr({ 'accept': fileType });
      }
      if (isMultiple) {
        input.attr({
          'multiple': 'multiple'
        });
      }
      el.append(input);
      return el
    }

    getClassNames () {
      return 'sc-upload-tool'
    }

    getFileType () {
      throw new Error('This method is abstract')
    }

    get canUploadMultiple () {
      return false
    }

    get doesAcceptAllFileTypes () {
      return false
    }

    _onClick (e) {
      e.stopPropagation();
      e.preventDefault();
      this.refs.input.el.val(null);
      this.refs.input.el.click();
    }

    onFileSelect (e) {
      let files = e.currentTarget.files;
      this.executeCommand({
        files: Array.prototype.slice.call(files)
      });
    }
  }

  // This is a base class for tools that upload a file
  class UploadSingleImageTool extends UploadTool {
    getFileType () {
      return 'image/*'
    }

    get canUploadMultiple () {
      return false
    }
  }

  class InsertFigurePanelTool extends UploadSingleImageTool {
    getClassNames () {
      return 'sc-insert-figure-panel-tool sc-upload-tool sc-tool'
    }
  }

  class InsertFigureTool extends UploadTool {
    getClassNames () {
      return 'sc-insert-figure-tool sc-upload-tool sc-tool'
    }

    getFileType () {
      return 'image/*'
    }

    get canUploadMultiple () {
      return true
    }
  }

  class InsertInlineGraphicTool extends UploadTool {
    getClassNames () {
      return 'sc-insert-inline-graphic-tool sc-upload-tool sc-tool'
    }

    getFileType () {
      return 'image/*'
    }
  }

  class InsertTableTool extends Tool {
    getClassNames () {
      return 'sc-insert-table-tool sc-tool'
    }

    onClick () {
      const rows = 3;
      const columns = 5;
      this.executeCommand({
        rows: rows,
        columns: columns
      });
    }
  }

  class ItalicComponent extends substance.AnnotationComponent {
    getTagName () {
      return 'i'
    }
  }

  class ListComponent extends NodeComponent {
    render ($$) {
      const ListItemComponent = this.getComponent('list-item');
      let node = this.props.node;
      // TODO: is it ok to rely on Node API here?
      let el = substance.renderListNode(node, item => {
        // item is either a list item node, or a tagName
        if (substance.isString(item)) {
          return $$(item)
        } else if (item.type === 'list-item') {
          return $$(ListItemComponent, {
            node: item
          }).ref(item.id)
        }
      });
      el.addClass('sc-list').attr('data-id', node.id);
      return el
    }

    // we need this ATM to prevent this being wrapped into an isolated node (see ContainerEditor._renderNode())
    get _isCustomNodeComponent () { return true }
  }

  class ListItemComponent extends NodeComponent {
    render ($$) {
      const node = this.props.node;
      const doc = node.getDocument();
      const path = node.getPath();
      const TextPropertyComponent = this.getComponent('text-property');

      let el = $$('li').addClass('sc-list-item');
      el.append(
        $$(TextPropertyComponent, {
          doc,
          name: substance.getKeyForPath(path),
          path
        })
      );
      // for nested lists
      if (this.props.children) {
        el.append(this.props.children);
      }
      return el
    }
  }

  class ManuscriptSection extends substance.Component {
    didMount () {
      addModelObserver(this.props.model, this._onModelUpdate, this);
    }

    dispose () {
      removeModelObserver(this);
    }

    render ($$) {
      const { model, name, label, children, hideWhenEmpty } = this.props;
      const SectionLabel = this.getComponent('section-label');

      let el = $$('div')
        .addClass('sc-manuscript-section')
        .addClass(`sm-${name}`)
        .attr({
          'data-section': name
        });
      // only rendering content if
      if (hideWhenEmpty && model.length === 0) {
        el.addClass('sm-empty');
      } else {
        el.append($$(SectionLabel, { label }));
        el.append(children);
      }

      return el
    }

    _onModelUpdate () {
      if (this.props.hideWhenEmpty) {
        this.rerender();
      }
    }
  }

  class ManuscriptComponent extends substance.Component {
    render ($$) {
      const manuscript = this.props.model;
      const AuthorsListComponent = this.getComponent('authors-list');
      const ReferenceListComponent = this.getComponent('reference-list');

      let el = $$('div').addClass('sc-manuscript');

      // TODO: maybe we want to be able to configure if a section should be hidden when empty

      /*// Title
      let titleModel = manuscript.getTitle()
      el.append(
        $$(ManuscriptSection, {
          name: 'title',
          label: this.getLabel('title-label'),
          model: titleModel
        }).append(
          renderModel($$, this, titleModel, {
            placeholder: this.getLabel('title-placeholder')
          }).addClass('sm-title')
        )
      )
      // Sub-title
      let subTitleModel = manuscript.getSubTitle()
      el.append(
        $$(ManuscriptSection, {
          name: 'subtitle',
          label: this.getLabel('subtitle-label'),
          model: subTitleModel
        }).append(
          renderModel($$, this, subTitleModel, {
            placeholder: this.getLabel('subtitle-placeholder')
          }).addClass('sm-subtitle')
        )
      )
      // Authors
      let authorsModel = manuscript.getAuthors()
      el.append(
        $$(ManuscriptSection, {
          name: 'authors',
          label: this.getLabel('authors-label'),
          model: authorsModel,
          hideWhenEmpty: true
        }).append(
          $$(AuthorsListComponent, {
            model: authorsModel,
            placeholder: this.getLabel('authors-placeholder')
          }).addClass('sm-authors')
        )
      )
      // Abstract
      let abstractModel = manuscript.getAbstract()
      el.append(
        $$(ManuscriptSection, {
          name: 'abstract',
          label: this.getLabel('abstract-label'),
          model: abstractModel
        }).append(
          renderModel($$, this, abstractModel, {
            name: 'abstract',
            placeholder: this.getLabel('abstract-placeholder')
          }).addClass('sm-abstract')
        )
      )*/
      // Body
      let bodyModel = manuscript.getBody();
      el.append(
        $$(ManuscriptSection, {
          name: 'body',
          label: this.getLabel('body-label'),
          model: bodyModel
        }).append(
          renderModel($$, this, bodyModel, {
            name: 'body',
            placeholder: this.getLabel('body-placeholder')
          }).addClass('sm-body')
        )
      );
      // Footnotes
      let footnotesModel = manuscript.getFootnotes();
      el.append(
        $$(ManuscriptSection, {
          name: 'footnotes',
          label: this.getLabel('footnotes-label'),
          model: footnotesModel,
          hideWhenEmpty: true
        }).append(
          renderModel($$, this, footnotesModel).addClass('sm-footnotes')
        )
      );
      // References
      let referencesModel = manuscript.getReferences();
      el.append(
        $$(ManuscriptSection, {
          name: 'references',
          label: this.getLabel('references-label'),
          model: referencesModel,
          hideWhenEmpty: true
        }).append(
          $$(ReferenceListComponent, {
            model: referencesModel
          }).addClass('sm-references')
        )
      );

      return el
    }
  }

  // TODO: this needs to be redesigned
  // TODO: we should follow the same approach as in Metadata, i.e. having a model which is a list of sections
  class ManuscriptTOC extends substance.Component {
    render ($$) {
      let el = $$('div').addClass('sc-toc');
      let manuscriptModel = this.props.model;

      let tocEntries = $$('div')
        .addClass('se-toc-entries')
        .ref('tocEntries')
        .on('click', substance.domHelpers.stop);

    /*  tocEntries.append(
        $$(SectionTOCEntry, {
          label: this.getLabel('title'),
          section: 'title'
        })
      )

      tocEntries.append(
        $$(SectionTOCEntry, {
          label: this.getLabel('abstract'),
          section: 'abstract'
        })
      )*/

      tocEntries.append(
        $$(BodyTOCEntry, {
          label: this.getLabel('body'),
          model: manuscriptModel.getBody()
        })
      );

      tocEntries.append(
        $$(DynamicTOCEntry, {
          label: this.getLabel('footnotes-label'),
          model: manuscriptModel.getFootnotes(),
          section: 'footnotes'
        })
      );

      tocEntries.append(
        $$(DynamicTOCEntry, {
          label: this.getLabel('references-label'),
          model: manuscriptModel.getReferences(),
          section: 'references'
        })
      );

      el.append(tocEntries);

      return el
    }

    onTOCUpdated () {
      this.rerender();
    }
  }

  class BodyTOCEntry extends ValueComponent {
    render ($$) {
      let items = this.props.model.getItems();
      let headings = items.filter(node => node.type === 'heading');
      return $$('div').addClass('sc-toc-entry').append(
        headings.map(heading => {
          let el = $$(TOCHeadingEntry, { node: heading }).ref(heading.id)
            .addClass(`sc-toc-entry sm-level-${heading.level}`)
            .attr({ 'data-id': heading.id })
            .on('click', this._onClick);
          return el
        })
      )
    }

    _onClick (event) {
      let target = substance.DefaultDOMElement.wrap(event.currentTarget);
      let nodeId = target.attr('data-id');
      event.preventDefault();
      event.stopPropagation();
      this.send('scrollTo', { nodeId });
    }
  }

  class TOCHeadingEntry extends substance.Component {
    didMount () {
      this.context.editorState.addObserver(['document'], this.rerender, this, {
        stage: 'render',
        document: { path: [this.props.node.id] }
      });
    }
    dispose () {
      this.context.editorState.removeObserver(this);
    }
    render ($$) {
      const api = this.context.api;
      let heading = this.props.node;
      return $$('div').append(
        renderModel($$, this, createValueModel(api, heading.getPath()), { readOnly: true })
      )
    }
  }

  // only visible when collection not empty
  class DynamicTOCEntry extends ValueComponent {
    render ($$) {
      let { label, model, section } = this.props;
      let el = $$('div')
        .addClass('sc-toc-entry sm-level-1')
        .attr({ 'data-section': section })
        .on('click', this._onClick)
        .append(label);
      if (model.length === 0) {
        el.addClass('sm-hidden');
      }
      return el
    }

    _onClick (event) {
      event.preventDefault();
      event.stopPropagation();
      this.send('scrollTo', { section: this.props.section });
    }
  }

  class ManuscriptEditor extends EditorPanel {
    _initialize (props) {
      super._initialize(props);

      this._model = this.context.api.getArticleModel();
    }

    getActionHandlers () {
      return {
        'acquireOverlay': this._acquireOverlay,
        'releaseOverlay': this._releaseOverlay
      }
    }

    didMount () {
      super.didMount();

      this._showHideTOC();
      this._restoreViewport();

      substance.DefaultDOMElement.getBrowserWindow().on('resize', this._showHideTOC, this);
      this.context.editorSession.setRootComponent(this._getContentPanel());
    }

    didUpdate () {
      super.didUpdate();

      this._showHideTOC();
      this._restoreViewport();
    }

    dispose () {
      super.dispose();

      substance.DefaultDOMElement.getBrowserWindow().off(this);
    }

    render ($$) {
      let el = $$('div').addClass('sc-manuscript-editor')
        // sharing styles with sc-article-reader
        .addClass('sc-manuscript-view');
      el.append(
        this._renderMainSection($$),
        this._renderContextPane($$)
      );
      el.on('keydown', this._onKeydown);
      return el
    }

    _renderMainSection ($$) {
      const appState = this.context.editorState;
      let mainSection = $$('div').addClass('se-main-section');
      mainSection.append(
        this._renderToolbar($$),
        $$('div').addClass('se-content-section').append(
          this._renderTOCPane($$),
          this._renderContentPanel($$)
        // TODO: this component has always the same structure and should preserve all elements, event without ref
        ).ref('contentSection'),
        this._renderFooterPane($$)
      );

      if (appState.workflowId) {
        mainSection.append(
          this._renderWorkflow($$, appState.workflowId)
        );
      }

      return mainSection
    }

    _renderTOCPane ($$) {
      let el = $$('div').addClass('se-toc-pane').ref('tocPane');
      el.append(
        $$('div').addClass('se-context-pane-content').append(
          $$(ManuscriptTOC, { model: this._model })
        )
      );
      return el
    }

    _renderToolbar ($$) {
      const Toolbar = this.getComponent('toolbar');
      const configurator = this._getConfigurator();
      const items = configurator.getToolPanel('toolbar', true);
      return $$('div').addClass('se-toolbar-wrapper').append(
        $$(Managed(Toolbar), {
          items,
          bindings: ['commandStates']
        }).ref('toolbar')
      )
    }

    _renderContentPanel ($$) {
      const ScrollPane = this.getComponent('scroll-pane');
      const ManuscriptComponent = this.getComponent('manuscript');
      let contentPanel = $$(ScrollPane, {
        contextMenu: 'custom',
        scrollbarPosition: 'right'
      // NOTE: this ref is needed to access the root element of the editable content
      }).ref('contentPanel');

      contentPanel.append(
        $$(ManuscriptComponent, {
          model: this._model,
          disabled: this.props.disabled
        }).ref('article'),
        this._renderMainOverlay($$),
        this._renderContextMenu($$)
      );
      return contentPanel
    }

    _renderMainOverlay ($$) {
      const panelProvider = () => this.refs.contentPanel;
      return $$(OverlayCanvas, {
        theme: this._getTheme(),
        panelProvider
      }).ref('overlay')
    }

    _renderContextMenu ($$) {
      const configurator = this._getConfigurator();
      const ContextMenu = this.getComponent('context-menu');
      const items = configurator.getToolPanel('context-menu');
      return $$(Managed(ContextMenu), {
        items,
        theme: this._getTheme(),
        bindings: ['commandStates']
      })
    }

    _renderFooterPane ($$) {
      const FindAndReplaceDialog = this.getComponent('find-and-replace-dialog');
      let el = $$('div').addClass('se-footer-pane');
      el.append(
        $$(FindAndReplaceDialog, {
          theme: this._getTheme(),
          viewName: 'manuscript'
        }).ref('findAndReplace')
      );
      return el
    }

    _renderContextPane ($$) {
      // TODO: we need to revisit this
      // We have introduced this to be able to inject a shared context panel
      // in Stencila. However, ATM we try to keep the component
      // as modular as possible, and avoid these kind of things.
      if (this.props.contextComponent) {
        let el = $$('div').addClass('se-context-pane');
        el.append(
          $$('div').addClass('se-context-pane-content').append(
            this.props.contextComponent
          )
        );
        return el
      }
    }

    _getContentPanel () {
      return this.refs.contentPanel
    }

    getViewport () {
      return {
        x: this.refs.contentPanel.getScrollPosition()
      }
    }

    _showHideTOC () {
      let contentSectionWidth = this.refs.contentSection.el.width;
      if (contentSectionWidth < 960) {
        this.el.addClass('sm-compact');
      } else {
        this.el.removeClass('sm-compact');
      }
    }

    _acquireOverlay (...args) {
      this.refs.overlay.acquireOverlay(...args);
    }

    _releaseOverlay (...args) {
      this.refs.overlay.releaseOverlay(...args);
    }
  }

  class MetadataFieldComponent extends NodeComponent {
    render ($$) {
      let el = $$('div').addClass('sc-metadata-field');
      el.append(
        this._renderValue($$, 'name', { placeholder: this.getLabel('enter-metadata-field-name') }).addClass('se-field-name'),
        this._renderValue($$, 'value', { placeholder: this.getLabel('enter-metadata-field-value') })
      );
      return el
    }
  }

  class ModelPreviewComponent extends substance.Component {
    didMount () {
      this.context.editorState.addObserver(['document'], this._onDocumentChange, this, { stage: 'render' });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    render ($$) {
      let node = this.props.node;
      let el = $$('div').addClass('sc-model-preview');
      el.html(
        // TODO: rethink this. IMO rendering should not be part of the Article API
        // Either it could be part of the general Model API, i.e. model.previewHtml()
        // or we could use some kind of configurable renderer, very much like a converter
        this.context.api.renderEntity(node)
      );
      return el
    }

    _onDocumentChange (change) {
      ifNodeOrRelatedHasChanged(this.props.node, change, () => this.rerender());
    }
  }

  class OpenFigurePanelImageTool extends Tool {
    render ($$) {
      let el = super.render($$);
      el.append(
        $$('a').ref('link')
          .attr('target', '_blank')
          // ATTENTION: stop propagation, otherwise infinite loop
          .on('click', substance.domHelpers.stop)
      );
      return el
    }

    getClassNames () {
      return 'sc-open-figure-panel-source-tool sc-tool'
    }

    _onClick (e) {
      e.stopPropagation();
      e.preventDefault();
      this._generateLink();
    }

    _generateLink () {
      const urlResolver = this.context.urlResolver;
      const editorSession = this.context.editorSession;
      const selectionState = editorSession.getSelectionState();
      const node = selectionState.node;
      let currentPanel = node;
      if (node.type === 'figure') {
        const panels = node.getPanels();
        const currentIndex = node.getCurrentPanelIndex();
        currentPanel = panels[currentIndex];
      }
      const graphic = currentPanel.resolve('content');
      const url = urlResolver.resolveUrl(graphic.href);
      if (url) {
        this.refs.link.el.attr({
          'href': url
        });
        this.refs.link.el.click();
      }
    }
  }

  class ParagraphComponent extends TextNodeComponent {
    getClassNames () {
      return 'sc-paragraph sc-text-node'
    }
  }

  // ATTENTION: this is displays all RefContribs of a Reference in an 'in-place' style i.e. like a little table
  class InplaceRefContribsEditor extends ValueComponent {
    getActionHandlers () {
      return {
        removeContrib: this._removeContrib
      }
    }
    render ($$) {
      const Button = this.getComponent('button');

      let el = $$('div').addClass('sc-inplace-ref-contrib-editor');
      el.append(this._renderRefContribs($$));
      el.append(
        $$(Button, {
          icon: 'insert'
        }).addClass('se-add-value')
          .on('click', this._addContrib)
      );
      return el
    }

    _renderRefContribs ($$) {
      const model = this.props.model;
      let items = model.getItems();
      return items.map(item => this._renderRefContrib($$, item))
    }

    _renderRefContrib ($$, refContrib) {
      let id = refContrib.id;
      return $$(InplaceRefContribEditor, { node: refContrib }).ref(id)
    }

    _addContrib () {
      this.props.model.addItem({ type: 'ref-contrib' });
    }

    _removeContrib (contrib) {
      this.props.model.removeItem(contrib);
    }
  }

  class InplaceRefContribEditor extends NodeComponent {
    render ($$) {
      const node = this.props.node;
      const Button = this.getComponent('button');
      let el = $$('div').addClass('sc-inplace-ref-contrib-editor');
      el.append(
        $$(FormRowComponent).attr('data-id', node.id).addClass('sm-ref-contrib').append(
          this._renderValue($$, 'name', {
            placeholder: this.getLabel('name')
          }).addClass('sm-name'),
          this._renderValue($$, 'givenNames', {
            placeholder: this.getLabel('given-names')
          }).addClass('sm-given-names'),
          $$(Button, {
            icon: 'remove'
          // TODO: do we need this ref?
          }).ref('remove-button').addClass('se-remove-value')
            .on('click', this._onRemove)
        )
      );
      return el
    }

    _onRemove () {
      this.send('removeContrib', this.props.node);
    }
  }

  class ReferenceComponent extends NodeComponent {
    render ($$) {
      let mode = this.props.mode;
      let node = this.props.node;
      let label = this._getReferenceLabel();
      let html = this.context.api.renderEntity(node);
      // TODO: use the label provider
      html = html || '<i>Not available</i>';
      if (mode === PREVIEW_MODE) {
        // NOTE: We return PreviewComponent directly, to prevent inheriting styles from .sc-reference
        return $$(PreviewComponent, {
          id: node.id,
          label,
          description: $$('div').html(html)
        })
      } else if (mode === METADATA_MODE) {
        return $$(ReferenceMetadataComponent, { node })
      } else {
        let el = $$('div').addClass('sc-reference');
        el.append(
          $$('div').addClass('se-label').append(label),
          $$('div').addClass('se-text').html(html)
        ).attr('data-id', node.id);
        return el
      }
    }

    _getReferenceLabel () {
      return getLabel(this.props.node) || '?'
    }
  }

  class ReferenceMetadataComponent extends DefaultNodeComponent {
    _getClassNames () {
      return 'sc-reference sm-metadata'
    }
    // using a special inplace property editor for 'ref-contrib's
    _getPropertyEditorClass (name, value) {
      if (value.hasTargetType('ref-contrib')) {
        return InplaceRefContribsEditor
      } else {
        return super._getPropertyEditorClass(name, value)
      }
    }
  }

  class ReferenceListComponent extends substance.CustomSurface {
    didMount () {
      super.didMount();

      const appState = this.context.editorState;
      appState.addObserver(['document'], this.rerender, this, { stage: 'render', document: { path: ['article', 'references'] } });
      // TODO: it is not good to rerender on every selection change.
      // Instead derive a meaningful state, and render if the state changes
      appState.addObserver(['selection'], this.rerender, this, { stage: 'render' });
    }

    dispose () {
      super.dispose();
      // TODO: as we have a node for references now, we should turn this into a NodeComponent instead
      this.context.editorState.removeObserver(this);
    }

    getInitialState () {
      let bibliography = this._getBibliography();
      return {
        hidden: (bibliography.length === 0)
      }
    }

    render ($$) {
      const sel = this.context.editorState.selection;
      const bibliography = this._getBibliography();

      let el = $$('div').addClass('sc-reference-list')
        .attr('data-id', 'ref-list');

      if (this.state.hidden) {
        el.addClass('sm-hidden');
        return el
      }

      bibliography.forEach(ref => {
        const referenceEl = $$(ReferenceDisplay, { node: ref }).ref(ref.id);
        if (sel && sel.nodeId === ref.id) {
          referenceEl.addClass('sm-selected');
        }
        el.append(referenceEl);
      });

      return el
    }

    _getCustomResourceId () {
      return 'reference-list'
    }

    _getBibliography () {
      let references = this.props.model.getItems();
      references.sort((a, b) => {
        return getPos(a) - getPos(b)
      });
      return references
    }
  }

  class ReferenceDisplay extends NodeComponent {
    render ($$) {
      let el = renderNode($$, this, this.props.node);
      el.on('mousedown', this._onMousedown)
        .on('click', this._onClick);
      return el
    }

    _onMousedown (e) {
      e.stopPropagation();
      if (e.button === 2) {
        this._select();
      }
    }

    _onClick (e) {
      e.stopPropagation();
      this._select();
    }

    _select () {
      this.context.api.selectEntity(this.props.node.id);
    }
  }

  class ReferenceUploadComponent extends FileUploadComponent {
    get acceptedFiles () {
      return 'application/json'
    }

    renderErrorsList ($$) {
      const dois = this.state.error.dois;
      const errorsList = $$('ul').addClass('se-error-list');
      errorsList.append(
        $$('li').append(this.state.error.message)
      );
      if (dois) {
        errorsList.append(dois.map(d => $$('li').append('- ' + d)));
      }
      return errorsList
    }

    handleUploadedFiles (files) {
      Object.values(files).forEach(file => {
        const reader = new window.FileReader();
        reader.onload = this._onFileLoad.bind(this);
        reader.readAsText(file);
      });
    }

    _onFileLoad (e) {
      const res = e.target.result;
      if (res) {
        let conversionErrors = [];
        let convertedEntries = [];
        const entries = JSON.parse(res);
        entries.forEach(entry => {
          try {
            convertedEntries.push(
              convertCSLJSON(entry)
            );
          } catch (error) {
            conversionErrors.push(entry.DOI || error);
          }
        });

        if (conversionErrors.length > 0) {
          let error = new Error('Conversion error');
          error.dois = conversionErrors;
          this.extendState({ error });
        } else {
          this.send('importBib', convertedEntries);
        }
      }
    }
  }

  class ReplaceFigurePanelTool extends UploadSingleImageTool {
    getClassNames () {
      return 'sc-replace-figure-panel-tool sc-upload-tool sc-tool'
    }
  }

  class ReplaceSupplementaryFileTool extends UploadTool {
    getClassNames () {
      return 'sc-replace-supplementary-file-tool sc-upload-tool sc-tool'
    }
    get doesAcceptAllFileTypes () {
      return true
    }

    get canUploadMultiple () {
      return false
    }
  }

  class SectionLabel extends substance.Component {
    render ($$) {
      const label = this.props.label;
      return $$('div').addClass('sc-section-label')
        .append(this.getLabel(label))
    }
  }

  class SubscriptComponent extends substance.AnnotationComponent {
    getTagName () {
      return 'sub'
    }
  }

  class SuperscriptComponent extends substance.AnnotationComponent {
    getTagName () {
      return 'sup'
    }
  }

  class SupplementaryFileComponent extends NodeComponent {
    render ($$) {
      const mode = this._getMode();
      // different rendering when rendered as preview or in metadata view
      if (mode === PREVIEW_MODE) {
        return this._renderPreviewVersion($$)
      }

      const node = this.props.node;
      // HACK: ATM, we do not have a label generator for supplementary files
      // that are inside a figure legend. It has not been specified yet
      // if these should have a label at all, or what the label should look like.
      const label = getLabel(node) || this.getLabel('supplementary-file');
      const SectionLabel = this.getComponent('section-label');
      // NOTE: we need an editable href only for remote files, for local files we just need to render a file name
      const hrefSection = node.remote ? this._renderValue($$, 'href', { placeholder: this.getLabel('supplementary-file-link-placeholder') })
        .addClass('se-href') : $$('div').addClass('se-href').text(node.href);

      let el = $$('div').addClass(`sc-supplementary-file sm-${mode}`);
      el.append(
        $$('div').addClass('se-header').append(
          // FIXME: not using a dedicated component for the label means that this is not updated
          $$('div').addClass('se-label').text(label)
        )
      );
      el.append(
        $$(SectionLabel, { label: 'legend-label' }),
        this._renderValue($$, 'legend', { placeholder: this.getLabel('legend-placeholder') }),
        $$(SectionLabel, { label: node.remote ? 'file-location' : 'file-name' }),
        hrefSection
      );
      return el
    }

    _renderPreviewVersion ($$) {
      const node = this.props.node;
      let label = getLabel(node);
      // TODO: PreviewComponent should work with a model
      // FIXME: there is problem with redirected components
      // and Component as props
      return $$('div').append($$(PreviewComponent, {
        id: node.id,
        label
      }))
    }

    _getMode () {
      return this.props.mode || 'manuscript'
    }
  }

  class TableCellEditor extends TextPropertyEditorNew {
    _getClassNames () {
      return 'sc-table-cell-editor ' + super._getClassNames()
    }

    _handleEscapeKey (event) {
      this.__handleKey(event, 'escape');
    }

    _handleEnterKey (event) {
      this.__handleKey(event, 'enter');
    }

    _handleTabKey (event) {
      this.__handleKey(event, 'tab');
    }

    __handleKey (event, name) {
      event.stopPropagation();
      event.preventDefault();
      this.el.emit(name, {
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
        code: event.code
      });
    }
  }

  class TableCellComponent extends NodeComponent {
    render ($$) {
      const cell = this.props.node;
      let el = $$(cell.heading ? 'th' : 'td');
      el.addClass('sc-table-cell');
      el.attr({
        'data-id': cell.id,
        'data-row-idx': cell.rowIdx,
        'data-col-idx': cell.colIdx
      });
      if (cell.rowspan > 1) {
        el.attr('rowspan', cell.rowspan);
      }
      if (cell.colspan > 1) {
        el.attr('colspan', cell.colspan);
      }
      el.append(
        $$(TableCellEditor, {
          path: cell.getPath(),
          disabled: this.props.disabled,
          multiLine: true
        }).ref(cell.id)
      );
      return el
    }

    getId () {
      return this.getAttribute('data-id')
    }
  }

  class TableContextMenu extends ToolPanel {
    render ($$) {
      let el = $$('div').addClass('sc-table-context-menu sc-context-menu');
      el.append(
        $$('div').append(
          this._renderItems($$)
        ).ref('entriesContainer')
      );
      return el
    }
  }

  class TableComponent extends substance.CustomSurface {
    constructor (...args) {
      super(...args);

      this._selectionData = {};
      this._clipboard = new substance.Clipboard();
    }

    getChildContext () {
      return {
        surface: this,
        parentSurfaceId: this.getId(),
        // HACK: nulling this so that nested surfaces get an id that are relative to
        // this surface instead of the isolatedNodeComponent
        isolatedNodeComponent: null
      }
    }

    shouldRerender (newProps) {
      return (newProps.node !== this.props.node || newProps.disabled !== this.props.disabled)
    }

    didMount () {
      super.didMount();

      this._tableSha = this.props.node._getSha();
      const appState = this.context.editorState;

      appState.addObserver(['document'], this._onDocumentChange, this, { stage: 'render' });
      appState.addObserver(['selection'], this._onSelectionChange, this, { stage: 'render' });

      this._positionSelection(this._getSelectionData());
    }

    dispose () {
      super.dispose();

      const appState = this.context.editorState;
      appState.off(this);
    }

    render ($$) {
      let el = $$('div').addClass('sc-table');
      el.on('mousedown', this._onMousedown)
        .on('mouseup', this._onMouseup)
        .on('click', this._prevent);
      el.append(this._renderTable($$));
      el.append(this._renderKeyTrap($$));
      el.append(this._renderUnclickableOverlays($$));
      // el.append(this._renderClickableOverlays($$))
      el.append(this._renderContextMenu($$));
      return el
    }

    _renderTable ($$) {
      let table = $$('table').ref('table');
      let node = this.props.node;
      let matrix = node.getCellMatrix();
      for (let i = 0; i < matrix.length; i++) {
        let cells = matrix[i];
        let tr = $$('tr');
        for (let j = 0; j < cells.length; j++) {
          if (cells[j].shadowed) continue
          let cell = cells[j];
          tr.append(
            $$(TableCellComponent, { node: cell, disabled: true })
              .ref(cell.id)
              .on('enter', this._onCellEnter)
              .on('tab', this._onCellTab)
              .on('escape', this._onCellEscape)
          );
        }
        table.append(tr);
      }
      table.on('mousemove', this._onMousemove)
        .on('dblclick', this._onDblclick)
        .on('contextmenu', this._onContextMenu)
        .on('contextmenuitemclick', this._onContextMenuItemClick);
      return table
    }

    _renderKeyTrap ($$) {
      return $$('textarea').addClass('se-keytrap').ref('keytrap')
        .css({ position: 'absolute', width: 0, height: 0, opacity: 0 })
        .on('keydown', this._onKeydown)
        .on('input', this._onInput)
        .on('copy', this._onCopy)
        .on('paste', this._onPaste)
        .on('cut', this._onCut)
    }

    _renderUnclickableOverlays ($$) {
      let el = $$('div').addClass('se-unclickable-overlays');
      el.append(
        this._renderSelectionOverlay($$)
      );
      el.append(
        this.props.unclickableOverlays
      );
      return el
    }

    _renderSelectionOverlay ($$) {
      let el = $$('div').addClass('se-selection-overlay');
      el.append(
        $$('div').addClass('se-selection-anchor').ref('selAnchor').css('visibility', 'hidden'),
        $$('div').addClass('se-selection-range').ref('selRange').css('visibility', 'hidden')
      );
      return el
    }

    _renderContextMenu ($$) {
      const config = this.context.config;
      let contextMenu;
      const items = config.getToolPanel('table-context-menu');
      if (items) {
        contextMenu = $$(Managed(TableContextMenu), {
          items,
          bindings: ['commandStates']
        });
      } else {
        contextMenu = $$('div');
      }
      contextMenu.ref('contextMenu')
        .addClass('se-context-menu')
        .css({ display: 'none' });
      return contextMenu
    }

    _onDocumentChange () {
      const table = this.props.node;
      // Note: using a simplified way to detect when a table
      // has changed structurally
      // TableElementNode is detecting such changes and
      // updates an internal 'sha' that we can compare against
      if (table._hasShaChanged(this._tableSha)) {
        this.rerender();
        this._tableSha = table._getSha();
      }
    }

    _onSelectionChange () {
      const doc = this.context.editorSession.getDocument();
      const sel = this.context.editorState.selection;
      const self = this;
      if (!sel || sel.isNull()) {
        _disableActiveCell();
        this._hideSelection();
      } else if (sel.isPropertySelection()) {
        let nodeId = sel.path[0];
        if (this._activeCell !== nodeId) {
          _disableActiveCell();
          let newCellEditor = this.refs[nodeId];
          if (newCellEditor) {
            // console.log('ENABLING CELL EDITOR', nodeId)
            newCellEditor.extendProps({ disabled: false });
            this._activeCell = nodeId;
          }
        }
        if (this._activeCell) {
          // TODO: this could be simplified
          let cell = doc.get(this._activeCell);
          this._positionSelection({
            type: 'range',
            anchorCellId: cell.id,
            focusCellId: cell.id
          }, true);
        } else {
          this._hideSelection();
        }
      } else if (sel.surfaceId !== this.getId()) {
        _disableActiveCell();
        this._hideSelection();
      } else {
        _disableActiveCell();
      }
      this._hideContextMenu();

      function _disableActiveCell () {
        const activeCellId = self._activeCell;
        if (activeCellId) {
          let cellEditor = self.refs[activeCellId];
          if (cellEditor) {
            // console.log('DISABLING CELL EDITOR', activeCellId)
            cellEditor.extendProps({ disabled: true });
          }
          self._activeCell = null;
        }
      }
    }

    _onMousedown (e) {
      // console.log('TableComponent._onMousedown()')
      e.stopPropagation();
      // TODO: do not update the selection if right-clicked and already having a selection
      if (substance.platform.inBrowser) {
        substance.DefaultDOMElement.wrap(window.document).on('mouseup', this._onMouseup, this, {
          once: true
        });
      }
      // console.log('_onMousedown', e)
      let selData = this._selectionData;
      if (!selData) selData = this._selectionData = {};
      let targetInfo = this._getClickTargetForEvent(e);
      // console.log('target', target)
      if (!targetInfo) return

      let isRightButton = substance.domHelpers.isRightButton(e);
      if (isRightButton) {
        // console.log('IS RIGHT BUTTON')
        // this will be handled by onContextMenu
        if (targetInfo.type === 'cell') {
          let targetCell = this.props.node.get(targetInfo.id);
          let _needSetSelection = true;
          let _selData = this._getSelectionData();
          if (_selData && targetCell) {
            let { startRow, startCol, endRow, endCol } = getCellRange(this.props.node, _selData.anchorCellId, _selData.focusCellId);
            _needSetSelection = (
              targetCell.colIdx < startCol || targetCell.colIdx > endCol ||
              targetCell.rowIdx < startRow || targetCell.rowIdx > endRow
            );
          }
          if (_needSetSelection) {
            this._isSelecting = true;
            selData.anchorCellId = targetInfo.id;
            selData.focusCellId = targetInfo.id;
            this._requestSelectionChange(this._createTableSelection(selData));
          }
        }
        return
      }
      if (targetInfo.type === 'cell') {
        this._isSelecting = true;
        selData.focusCellId = targetInfo.id;
        if (!e.shiftKey) {
          selData.anchorCellId = targetInfo.id;
        }
        e.preventDefault();
        this._requestSelectionChange(this._createTableSelection(selData));
      }
    }

    _onMouseup (e) {
      e.stopPropagation();
      if (this._isSelecting) {
        e.preventDefault();
        this._isSelecting = false;
      }
    }

    _onMousemove (e) {
      if (this._isSelecting) {
        const selData = this._selectionData;
        let cellId = this._mapClientXYToCellId(e.clientX, e.clientY);
        if (cellId !== selData.focusCellId) {
          selData.focusCellId = cellId;
          this._requestSelectionChange(this._createTableSelection(selData));
        }
      }
    }

    _onDblclick (e) {
      e.preventDefault();
      e.stopPropagation();
      this._requestEditCell();
    }

    _onKeydown (e) {
      let handled = false;
      switch (e.keyCode) {
        case substance.keys.LEFT:
          this._nav(0, -1, e.shiftKey);
          handled = true;
          break
        case substance.keys.RIGHT:
          this._nav(0, 1, e.shiftKey);
          handled = true;
          break
        case substance.keys.UP:
          this._nav(-1, 0, e.shiftKey);
          handled = true;
          break
        case substance.keys.DOWN:
          this._nav(1, 0, e.shiftKey);
          handled = true;
          break
        case substance.keys.ENTER: {
          this._requestEditCell();
          handled = true;
          break
        }
        case substance.keys.TAB: {
          this._nav(0, 1);
          handled = true;
          break
        }
        case substance.keys.DELETE:
        case substance.keys.BACKSPACE: {
          this._clearSelection();
          handled = true;
          break
        }
        default:
          //
      }
      // let an optional keyboard manager handle the key
      if (!handled) {
        const keyboardManager = this.context.keyboardManager;
        if (keyboardManager) {
          handled = keyboardManager.onKeydown(e);
        }
      }
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    /*
      Type into cell (replacing the existing content)
    */
    _onInput () {
      const value = this.refs.keytrap.val();
      this._requestEditCell(value);
      // Clear keytrap after sending an action
      this.refs.keytrap.val('');
    }

    _onCellEnter (e) {
      e.stopPropagation();
      e.preventDefault();
      let cellEl = substance.DefaultDOMElement.wrap(e.target).getParent();
      if (e.detail.shiftKey) {
        this.context.api.getTableAPI().insertSoftBreak();
      } else {
        let cellId = _getCellId(cellEl);
        this._nav(1, 0, false, { anchorCellId: cellId, focusCellId: cellId });
      }
    }

    _onCellTab (e) {
      e.stopPropagation();
      e.preventDefault();
      let cellEl = substance.DefaultDOMElement.wrap(e.target).getParent();
      let cellId = _getCellId(cellEl);
      this._nav(0, 1, false, { anchorCellId: cellId, focusCellId: cellId });
    }

    _onCellEscape (e) {
      e.stopPropagation();
      e.preventDefault();
      let cellEl = substance.DefaultDOMElement.wrap(e.target).getParent();
      let cellId = _getCellId(cellEl);
      this._requestSelectionChange(this._createTableSelection({ anchorCellId: cellId, focusCellId: cellId }));
    }

    _onCopy (e) {
      e.preventDefault();
      e.stopPropagation();
      let clipboardData = e.clipboardData;
      this._clipboard.copy(clipboardData, this.context);
    }

    _onCut (e) {
      e.preventDefault();
      e.stopPropagation();
      let clipboardData = e.clipboardData;
      this._clipboard.cut(clipboardData, this.context);
    }

    _onPaste (e) {
      e.preventDefault();
      e.stopPropagation();
      let clipboardData = e.clipboardData;
      // TODO: allow to force plain-text paste
      this._clipboard.paste(clipboardData, this.context);
    }

    _onContextMenu (e) {
      e.preventDefault();
      e.stopPropagation();
      this._showContextMenu(e);
    }

    _onContextMenuItemClick (e) {
      e.preventDefault();
      e.stopPropagation();
      this._hideContextMenu();
    }

    _getSelection () {
      return this.context.editorSession.getSelection()
    }

    _getSelectionData () {
      let sel = this._getSelection();
      if (sel && sel.surfaceId === this.getId()) {
        return sel.data
      }
    }

    _requestEditCell (initialValue) {
      let selData = this._getSelectionData();
      if (selData) {
        // type over cell
        if (initialValue) {
          // TODO: is there a more common action to describe this?
          // seems that this is like 'typing'
          // Otherwise it is only setting the selection
          this._getTableApi().insertText(initialValue);
        } else {
          // TODO: do we have a general API to set the selection
          // into a specific editor?
          const doc = this.props.node.getDocument();
          let cell = doc.get(selData.anchorCellId);
          let path = cell.getPath();
          // TODO: we need low-level API to set the selection
          this.context.api._setSelection({
            type: 'property',
            path,
            startOffset: cell.getLength(),
            surfaceId: this.getId() + '/' + substance.getKeyForPath(path)
          });
        }
      }
    }

    _requestSelectionChange (newSel) {
      // console.log('requesting selection change', newSel)
      this.context.editorSession.setSelection(newSel);
    }

    _getClickTargetForEvent (e) {
      let target = substance.DefaultDOMElement.wrap(e.target);
      let cellEl = substance.domHelpers.findParent(target, 'td,th');
      if (cellEl) {
        let cellId = _getCellId(cellEl);
        return { type: 'cell', id: cellId }
      }
    }

    _getRowCol (cellEl) {
      let rowIdx = parseInt(cellEl.getAttribute('data-row-idx'), 10);
      let colIdx = parseInt(cellEl.getAttribute('data-col-idx'), 10);
      return [rowIdx, colIdx]
    }

    _mapClientXYToCellId (x, y) {
      // TODO: this could be optimized using bisect search
      let cellEls = this.refs.table.el.findAll('th,td');
      for (let i = 0; i < cellEls.length; i++) {
        let cellEl = cellEls[i];
        let rect = substance.domHelpers.getBoundingRect(cellEl);
        if (substance.domHelpers.isXInside(x, rect) && substance.domHelpers.isYInside(y, rect)) {
          return _getCellId(cellEl)
        }
      }
    }

    _nav (dr, dc, expand, selData) {
      selData = selData || this._getSelectionData();
      if (selData) {
        let newSelData = computeUpdatedSelection(this.props.node, selData, dr, dc, expand);
        this._requestSelectionChange(this._createTableSelection(newSelData));
      }
    }

    _getCustomResourceId () {
      return this.props.node.id
    }

    _clearSelection () {
      let selData = this._getSelectionData();
      if (selData) {
        this._getTableApi().deleteSelection();
      }
    }

    rerenderDOMSelection () {
      // console.log('SheetComponent.rerenderDOMSelection()')
      this._positionSelection(this._getSelectionData());
      // // put the native focus into the keytrap so that we
      // // receive keyboard events
      this.refs.keytrap.el.focus({ preventScroll: true });
    }

    _positionSelection (selData, focused) {
      // TODO: find a better criteria for integrity checking
      if (!selData) {
        this._hideSelection();
        return
      }
      let { anchorCellId, focusCellId } = selData;

      let anchorCellComp = this._getActualCellComp(anchorCellId);
      let anchorRect = substance.getRelativeBoundingRect(anchorCellComp.el, this.el);
      this.refs.selAnchor.css(this._getStylesForRectangle(anchorRect));

      if (!focused) {
        let rangeRect;
        if (focusCellId === anchorCellId) {
          rangeRect = anchorRect;
        } else {
          let focusCellComp = this._getActualCellComp(focusCellId);
          let focusRect = substance.getRelativeBoundingRect(focusCellComp.el, this.el);
          rangeRect = substance.domHelpers.getBoundingRectForRects(anchorRect, focusRect);
        }
        this.refs.selRange.css(this._getStylesForRectangle(rangeRect));
      } else {
        this.refs.selRange.css('visibility', 'hidden');
      }
    }

    _getActualCellComp (cellId) {
      let table = this.props.node;
      let cell = table.get(cellId);
      if (cell.shadowed) cell = cell.masterCell;
      return this.refs[cell.id]
    }

    _hideSelection () {
      this.refs.selAnchor.css('visibility', 'hidden');
      this.refs.selRange.css('visibility', 'hidden');
    }

    _hideContextMenu () {
      this.refs.contextMenu.addClass('sm-hidden');
    }

    _showContextMenu (e) {
      let contextMenu = this.refs.contextMenu;
      let offset = this.el.getOffset();
      contextMenu.css({
        display: 'block',
        top: e.clientY - offset.top,
        left: e.clientX - offset.left
      });
      contextMenu.removeClass('sm-hidden');
    }

    _getStylesForRectangle (rect) {
      let styles = { visibility: 'hidden' };
      if (rect) {
        Object.assign(styles, rect);
        if (isFinite(rect.top) && isFinite(rect.left) &&
          isFinite(rect.width) && isFinite(rect.height)) {
          styles.visibility = 'visible';
        }
      }
      return styles
    }

    _createTableSelection (selData) {
      let tableId = this.props.node.id;
      let surfaceId = this.getId();
      let sel = createTableSelection(tableId, selData, surfaceId);
      return sel
    }

    _getTableApi () {
      return this.context.api.getTableAPI()
    }

    _prevent (event) {
      event.stopPropagation();
      event.preventDefault();
    }
  }

  function _getCellId (cellEl) {
    return substance.Component.unwrap(cellEl).getId()
  }

  class TableFigureComponentWithMetadata extends FigurePanelComponentWithMetadata {
    _getClassNames () {
      return `sc-table-figure-metadata`
    }

    _getPropertyEditorClass (name, value) {
      // skip 'label' here, as it is shown 'read-only' in the header instead
      if (name === 'label') {
        return null
      // special editor to pick license type
      } else if (name === 'license') {
        return LicenseEditor
      } else if (name === 'footnotes') {
        return FootnoteEditor
      } else {
        return super._getPropertyEditorClass(name, value)
      }
    }
  }

  /**
   * A TableFigure is similar to a figure but has only one panel, and a table as content.
   * Additionally it can contain footnotes.
   */
  class TableFigureComponent extends FigurePanelComponent {
    _getClassNames () {
      return `sc-table-figure`
    }

    _renderManuscriptVersion ($$) {
      const mode = this._getMode();
      const node = this.props.node;
      const SectionLabel = this.getComponent('section-label');

      let el = $$('div')
        .addClass(this._getClassNames())
        .attr('data-id', node.id)
        .addClass(`sm-${mode}`)
        .addClass();

      el.append(
        $$(SectionLabel, { label: 'label-label' }),
        $$(LabelComponent, { node }),
        // no label for the graphic
        this._renderContent($$),
        $$(SectionLabel, { label: 'title-label' }),
        this._renderValue($$, 'title', { placeholder: this.getLabel('title-placeholder') }).addClass('se-title'),
        $$(SectionLabel, { label: 'legend-label' }),
        this._renderValue($$, 'legend', { name: 'legend', placeholder: this.getLabel('legend-placeholder') }).addClass('se-legend')
      );

      // FIXME: does not react to node.footnotes changes
      if (node.footnotes.length > 0) {
        el.append(
          $$(SectionLabel, { label: 'footnotes-label' }),
          this._renderValue($$, 'footnotes').ref('footnotes').addClass('se-footnotes')
        );
      }

      return el
    }

    _renderMetadataVersion ($$) {
      return $$(TableFigureComponentWithMetadata, { node: this.props.node }).ref('metadata')
    }
  }

  class UnsupportedInlineNodeComponent extends substance.Component {
    render ($$) {
      const node = this.props.node;
      let data;
      if (node._isXMLNode) {
        data = node.toXML().serialize();
      } else if (node.data) {
        data = node.data;
      } else {
        data = JSON.stringify(node.toJSON());
      }
      let el = $$('span').addClass('sc-unsupported-inline-node').append(
        $$('code').text(data)
      ).attr({
        'data-id': node.id,
        contenteditable: false
      });
      return el
    }
  }

  class UnsupportedNodeComponent extends IsolatedNodeComponentNew {
    _getContentClass () {
      return UnsupportedContentComponent
    }
  }

  class UnsupportedContentComponent extends substance.Component {
    render ($$) {
      const node = this.props.node;
      let data;
      if (node._isXMLNode) {
        data = node.toXML().serialize();
      } else if (node.data) {
        data = node.data;
      } else {
        data = JSON.stringify(node.toJSON());
      }
      let el = $$('div').addClass('sc-unsupported').append(
        $$('pre').text(data)
      ).attr({
        'data-id': node.id,
        'contenteditable': false
      });

      return el
    }
  }

  class XrefEditor extends NodeComponent {
    render ($$) {
      const targets = this._getAvailableTargets();
      let el = $$('div').addClass('sc-edit-xref-tool');
      // ATTENTION the targets are not models or nodes, but entries
      // created by xrefHelpers
      // TODO: use something more idiomatic
      for (let entry of targets) {
        const target = entry.node;
        if (!target) continue
        const selected = entry.selected;
        let targetPreviewEl = this._renderOption($$, target, selected);
        targetPreviewEl.on('click', this._toggleTarget.bind(this, target.id), this);
        el.append(targetPreviewEl);
      }
      return el
    }

    _renderOption ($$, target, selected) {
      let optionEl = $$('div').addClass('se-option').append(
        renderNode($$, this, target, {
          mode: PREVIEW_MODE
        })
      );
      if (selected) {
        optionEl.addClass('sm-selected');
      }
      return optionEl
    }

    _getNode () {
      return this.props.node
    }

    _getAvailableTargets () {
      let node = this._getNode();
      return this.context.api._getAvailableXrefTargets(node)
    }

    _toggleTarget (targetNodeId, e) {
      // Make sure we don't follow external links
      e.preventDefault();
      e.stopPropagation();
      let node = this._getNode();
      let targets = this.context.api._toggleXrefTarget(node, targetNodeId);
      this.setState({ targets });
    }
  }

  class XrefComponent extends EditableInlineNodeComponent {
    render ($$) {
      let node = this.props.node;
      let refType = node.refType;
      let label = getXrefLabel(node);
      let el = super.render($$)
        .addClass('sc-xref sm-' + refType);
      if (!label) {
        el.addClass('sm-no-label');
        el.append('?');
      } else {
        el.append(label);
      }
      return el
    }

    _getEditorClass () {
      return XrefEditor
    }
  }

  class TableConverter {
    get tagName () { return 'table' }

    get type () { return 'table' }

    import (el, node, importer) {
      const doc = importer.state.doc;
      const $$ = (type, props = {}) => doc.create(Object.assign(props, { type }));
      let rows = el.findAll('tr');
      let newRows = rows.map(tr => {
        return {
          id: tr.id,
          children: []
        }
      });
      // ATTENTION: this code is not 'idiomatic' as it does not delegate to converters for children elements
      // and instead creates document nodes on the fly
      for (let i = 0; i < rows.length; i++) {
        let tr = rows[i];
        let newRow = newRows[i];
        let children = tr.getChildren();
        for (let j = 0, k = 0; j < children.length; j++, k++) {
          // skipping spanned cells which is necessary
          // because HTML tables have a sparse representation w.r.t. span
          while (newRow.children[k]) k++;
          let c = children[j];
          let attributes = {};
          if (c.is('th')) attributes.heading = true;
          let rowspan = c.attr('rowspan');
          if (rowspan) {
            rowspan = Math.max(1, parseInt(rowspan, 10));
            if (rowspan > 1) {
              attributes.rowspan = rowspan;
            }
          }
          let colspan = c.attr('colspan');
          if (colspan) {
            colspan = Math.max(1, parseInt(colspan, 10));
            if (colspan > 1) {
              attributes.colspan = colspan;
            }
          }
          // flag all spanned cells so that we can skip them
          _fillSpanned($$, newRows, i, k, rowspan, colspan);
          const cellId = c.id || substance.uuid();
          let cell = $$('table-cell', {
            id: cellId,
            heading: attributes['heading'],
            rowspan: attributes['rowspan'],
            colspan: attributes['colspan'],
            content: importer.annotatedText(c, [cellId, 'content'])
          });
          newRows[i].children[k] = cell;
        }
      }
      node.rows = newRows.map(data => {
        let row = $$('table-row', {
          id: data.id,
          cells: data.children.map(cell => cell.id)
        });
        return row.id
      });
    }

    export (table, el, exporter) {
      const $$ = exporter.$$;
      let htmlTable = $$('table').attr('id', table.id);
      let tbody = $$('tbody');
      let rows = table.resolve('rows');
      let matrix = table.getCellMatrix();
      for (let i = 0; i < rows.length; i++) {
        let row = rows[i];
        let cells = matrix[i];
        let tr = $$('tr').attr('id', row.id);
        for (let j = 0; j < cells.length; j++) {
          let cell = cells[j];
          if (cell.shadowed) continue
          let el = $$(cell.heading ? 'th' : 'td');
          let attributes = { id: cell.id };
          let rowspan = cell.rowspan;
          if (rowspan) {
            if (rowspan > 1) {
              attributes.rowspan = String(rowspan);
            }
          }
          let colspan = cell.colspan;
          if (colspan) {
            if (colspan > 1) {
              attributes.colspan = String(colspan);
            }
          }
          el.attr(attributes);
          el.append(exporter.annotatedText(cell.getPath()));
          tr.append(el);
        }
        tbody.append(tr);
      }
      htmlTable.append(tbody);
      return htmlTable
    }
  }

  function _fillSpanned ($$, newRows, row, col, rowspan, colspan) {
    if (!rowspan && !colspan) return
    if (!rowspan) rowspan = 1;
    if (!colspan) colspan = 1;
    for (let i = row; i < row + rowspan; i++) {
      for (let j = col; j < col + colspan; j++) {
        if (i === row && j === col) continue
        newRows[i].children[j] = $$('table-cell');
      }
    }
  }

  var BoldConverter = {
    type: 'bold',
    tagName: 'b',
    matchElement (el) {
      return (el.is('b')) ||
        (el.is('span') && el.getStyle('font-weight') === '700')
    }
  };

  var ExtLinkConverter = {
    type: 'external-link',
    tagName: 'a',
    import (el, node) {
      let href = el.getAttribute('href');
      if (href) {
        node.href = href;
      }
    },
    export (node, el) {
      el.setAttribute('href', node.href);
    }
  };

  var PreformatConverter = {
    type: 'preformat',
    tagName: 'pre',
    import (el, node, converter) {
      node.content = converter.annotatedText(el, [node.id, 'content'], { preserveWhitespace: true });
    },
    export (node, el, converter) {
      el.append(
        converter.annotatedText([node.id, 'content'])
      );
    }
  };

  var HeadingConverter = {
    type: 'heading',

    matchElement (el) {
      return /^h\d$/.exec(el.tagName)
    },

    import (el, node, converter) {
      node.content = converter.annotatedText(el, [node.id, 'content'], { preserveWhitespace: true });
    },

    export (node, el, converter) {
      el.tagName = `h${node.level}`;
      el.append(converter.annotatedText([node.id, 'content']));
    }
  };

  var ItalicConverter = {
    type: 'italic',
    tagName: 'i',
    matchElement (el) {
      return (el.is('i')) ||
        (el.is('span') && el.getStyle('font-style') === 'italic')
    }
  };

  class ListConverter {
    get type () { return 'list' }

    matchElement (el) {
      return el.is('ul') || el.is('ol')
    }

    import (el, node, converter) {
      this._santizeNestedLists(el);

      let items = [];
      let config = [];
      substance.domHelpers.walk(el, (el, level) => {
        if (!el.isElementNode()) return
        if (el.is('li')) {
          items.push({ el, level });
        } else if (!config[level]) {
          if (el.is('ul')) config[level] = 'bullet';
          else if (el.is('ol')) config[level] = 'order';
        }
      });
      this._createListItems(converter, node, items, config);
    }

    _createListItems (converter, node, items, levelTypes) {
      node.items = items.map(d => {
        let listItem = converter.convertElement(d.el);
        listItem.level = d.level;
        return listItem.id
      });
      node.listType = levelTypes.join(',');
    }

    export (node, el, converter) {
      let $$ = converter.$$;
      let _createElement = function (arg) {
        if (substance.isString(arg)) {
          return $$(arg)
        } else {
          let item = arg;
          let path = item.getPath();
          return $$('li').append(converter.annotatedText(path))
        }
      };
      let _el = substance.renderListNode(node, _createElement);
      el.tagName = _el.tagName;
      el.attr(_el.getAttributes());
      el.append(_el.getChildNodes());
      return el
    }

    _santizeNestedLists (root) {
      // pulling out uls from <li> to simplify the problem
      /*
        E.g.
        `<ul><li>Foo:<ul>...</ul></li>`
        Is turned into:
        `<ul><li>Foo:</li><ul>...</ul></ul>`
      */
      let nestedLists = root.findAll('ol,ul');
      nestedLists.forEach((el) => {
        while (!el.parentNode.is('ol,ul')) {
          let parent = el.parentNode;
          let grandParent = parent.parentNode;
          let pos = grandParent.getChildIndex(parent);
          grandParent.insertAt(pos + 1, el);
        }
      });
    }
  }

  var ListItemConverter = {

    type: 'list-item',

    matchElement: function (el) {
      return el.is('li')
    },

    import: function (el, node, converter) {
      node.content = converter.annotatedText(el, [node.id, 'content']);
    },

    export: function (node, el, converter) {
      el.append(converter.annotatedText(node.getPath()));
    }
  };

  var ParagraphConverter = {
    type: 'paragraph',
    tagName: 'p',
    import (el, node, converter) {
      node.content = converter.annotatedText(el, [node.id, 'content']);
    },
    export (node, el, converter) {
      el.append(converter.annotatedText([node.id, 'content']));
    }
  };

  var StrikeConverter = {
    type: 'strike-through',
    tagName: 's',
    matchElement (el) {
      return el.is('s') || el.is('strike') || el.getStyle('text-decoration') === 'line-through'
    },
    export (node, el) {
      el.setStyle('text-decoration', 'line-through');
    }
  };

  var SubConverter = {
    type: 'subscript',
    tagName: 'sub',
    matchElement (el) {
      return (el.is('sub')) || (el.is('span') && el.getStyle('vertical-align') === 'sub')
    }
  };

  var SupConverter = {
    type: 'superscript',
    tagName: 'sup',
    matchElement (el) {
      return (el.is('sup')) || (el.is('span') && el.getStyle('vertical-align') === 'super')
    }
  };

  var UnderlineConverter = {
    type: 'underline',
    tagName: 'u',
    matchElement (el) {
      return el.is('u') || el.getStyle('text-decoration') === 'underline'
    },
    export (node, el) {
      el.setStyle('text-decoration', 'underline');
    }
  };

  var ArticleHTMLConverters = [
    BoldConverter,
    PreformatConverter,
    ExtLinkConverter,
    HeadingConverter,
    ItalicConverter,
    ListConverter,
    ListItemConverter,
    ParagraphConverter,
    StrikeConverter,
    SubConverter,
    SupConverter,
    new TableConverter(),
    UnderlineConverter
  ];

  class ArticleHTMLExporter extends substance.HTMLExporter {}

  class ArticleHTMLImporter extends substance.HTMLImporter {
    _getUnsupportedElementConverter () {
      return _UnsupportedElementImporter
    }
  }

  const _UnsupportedElementImporter = {
    type: 'paragraph',
    import (el, node, converter) {
      node.content = converter.annotatedText(el, [node.id, 'content'], { preserveWhitespace: true });
    }
  };

  function createEmptyJATS () {
    return substance.DefaultDOMElement.parseXML(EMPTY_JATS)
  }

  function getText (rootEl, selector) {
    let el = rootEl.find(selector);
    if (el) {
      return el.textContent
    } else {
      return ''
    }
  }

  function getSeparatedText (rootEl, selector) {
    let el = rootEl.findAll(selector);
    if (el) {
      return el.map(m => { return m.textContent }).join('; ')
    } else {
      return ''
    }
  }

  function getAttr (rootEl, selector, attr) {
    let el = rootEl.find(selector);
    if (el) {
      return el.attr(attr)
    } else {
      return ''
    }
  }

  function findChild (el, cssSelector) {
    const children = el.getChildren();
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.is(cssSelector)) return child
    }
  }

  function findAllChildren (el, cssSelector) {
    const children = el.getChildren();
    let result = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (child.is(cssSelector)) {
        result.push(child);
      }
    }
    return result
  }

  function printElement (el, options = {}) {
    let maxLevel = options.maxLevel || 1000;
    let res = _printElement(el, 1, maxLevel);
    return res
  }

  function retainChildren (el, ...allowedTagNames) {
    allowedTagNames = new Set(allowedTagNames);
    let childNodes = el.getChildNodes();
    for (let idx = childNodes.length - 1; idx >= 0; idx--) {
      let child = childNodes[idx];
      if (!allowedTagNames.has(child.tagName)) {
        el.removeAt(idx);
      }
    }
    return el
  }

  function _printElement (el, level, maxLevel) {
    let INDENT = new Array(level - 1);
    INDENT.fill('  ');
    INDENT = INDENT.join('');

    if (el.isElementNode()) {
      if (level <= maxLevel) {
        let res = [];
        res.push(INDENT + _openTag(el));
        res = res.concat(
          el.childNodes.map((child) => {
            return _printElement(child, level + 1, maxLevel)
          }).filter(Boolean)
        );
        res.push(INDENT + _closeTag(el));
        return res.join('\n')
      } else {
        return INDENT + _openTag(el) + '...' + _closeTag(el)
      }
    } else if (el.isTextNode()) {
      let textContent = el.textContent;
      if (/^\s*$/.exec(textContent)) {
        return ''
      } else {
        return INDENT + JSON.stringify(el.textContent)
      }
    } else {
      // TODO: render other node types and consider maxLevel
      return INDENT + el.serialize()
    }
  }

  function _openTag (el) {
    let attribStr = substance.DomUtils.formatAttribs(el);
    if (attribStr) {
      return `<${el.tagName} ${attribStr}>`
    } else {
      return `<${el.tagName}>`
    }
  }

  function _closeTag (el) {
    return `</${el.tagName}>`
  }

  class SectionContainerConverter {
    import (el, node, importer) {
      let children = el.getChildren();
      let flattened = [];
      for (let child of children) {
        if (child.tagName === 'sec') {
          flattened = flattened.concat(this._flattenSec(child, 1));
        } else {
          flattened.push(child);
        }
      }
      node.content = flattened.map(el => importer.convertElement(el).id);
    }

    _flattenSec (sec, level) {
      let result = [];

      let h = sec.createElement('heading');
      // Note: mapping the section id
      // TODO: what about other attributes?
      h.attr({
        id: sec.attr('id'),
        level
      });
      // ATTENTION: <sec-meta> is not supported
      if (findChild(sec, 'sec-meta')) {
        console.error('<sec-meta> is not supported by <heading> right now.');
      }
      // mapping sec > label to heading[label]
      // TODO: is this really the way we want to do it?
      let label = findChild(sec, 'label');
      if (label) {
        h.attr('label', label.textContent);
        label.remove();
      }
      // The title is essentially the h
      let title = findChild(sec, 'title');
      if (title) {
        h.append(title.childNodes);
        title.remove();
      }
      result.push(h);

      // process the remaining content recursively
      let children = sec.children;
      let L = children.length;
      for (let i = 0; i < L; i++) {
        const child = children[i];
        if (child.tagName === 'sec') {
          result = result.concat(this._flattenSec(child, level + 1));
        } else {
          result.push(child);
        }
      }

      return result
    }

    export (node, el, exporter) {
      let $$ = el.createElement.bind(el);
      const children = node.resolve('content');
      let stack = [{ el }];
      for (let child of children) {
        if (child.type === 'heading') {
          let heading = child;
          let level = heading.level;
          while (stack.length >= level + 1) {
            stack.pop();
          }
          let sec = $$('sec').attr({ id: heading.id });
          let title = $$('title');
          title.append(exporter.annotatedText(heading.getPath()));
          sec.appendChild(title);
          substance.last(stack).el.appendChild(sec);
          stack.push({ el: sec });
        } else {
          substance.last(stack).el.appendChild(
            exporter.convertNode(child)
          );
        }
      }
    }
  }

  function internal2jats (doc, jatsExporter) { // eslint-disable-line
    let jats = createEmptyJATS();
    jats.$$ = jats.createElement.bind(jats);

    // metadata
    _populateMeta(jats, doc, jatsExporter);
    _populateBody(jats, doc, jatsExporter);
    _populateBack(jats, doc, jatsExporter);

    return jats
  }

  function _populateMeta (jats, doc, jatsExporter) {
    // TODO: journal-meta would go here, but is not supported yet

    // @article-type
    let articleEl = jats.find('article');
    let metadata = doc.get('metadata');
    if (metadata.articleType) {
      articleEl.attr('article-type', metadata.articleType);
    }

    _populateArticleMeta(jats, doc, jatsExporter);

    // TODO: def-list would go here, but is not supported yet
  }

  function _populateArticleMeta (jats, doc, jatsExporter) {
    const $$ = jats.$$;
    let articleMeta = jats.createElement('article-meta');
    let metadata = doc.get('metadata');
    let permission = doc.get(metadata.permission);

    // article-id*
    // TODO not supported yet

    // article-categories?
    articleMeta.append(_exportSubjects(jats, doc));

    // title-group?
    articleMeta.append(_exportTitleGroup(jats, doc, jatsExporter))

    // contrib-group*
    ;[
      ['author', ['metadata', 'authors']],
      ['editor', ['metadata', 'editors']]
    ].forEach(([type, collectionPath]) => {
      articleMeta.append(
        _exportContribGroup(jats, doc, jatsExporter, collectionPath, type)
      );
    });

    // aff*
    articleMeta.append(_exportAffiliations(jats, doc));

    // author-notes? // not supported yet

    // pub-date*,
    articleMeta.append(
      _exportDate($$, metadata, 'publishedDate', 'pub', 'pub-date')
    );

    // volume?,
    if (metadata.volume) {
      articleMeta.append($$('volume').append(metadata.volume));
    }

    // issue?,
    if (metadata.issue) {
      articleMeta.append($$('issue').append(metadata.issue));
    }

    // issue-title?,
    if (metadata.issueTitle) {
      articleMeta.append(
        $$('issue-title').append(
          jatsExporter.annotatedText(['metadata', 'issueTitle'])
        )
      );
    }

    // isbn?, // not supported yet

    // (((fpage,lpage?)?,page-range?)|elocation-id)?,
    if (metadata.elocationId) {
      articleMeta.append(
        $$('elocation-id').append(metadata.elocationId)
      );
    } else if (metadata.fpage && metadata.lpage) {
      // NOTE: last argument is used to resolve insert position, as we don't have means
      // yet to ask for insert position of multiple elements
      let pageRange = metadata.pageRange || metadata.fpage + '-' + metadata.lpage;
      articleMeta.append(
        $$('fpage').append(metadata.fpage),
        $$('lpage').append(metadata.lpage),
        $$('page-range').append(pageRange)
      );
    }

    // history?,
    const historyEl = $$('history');
    historyEl.append(_exportDate($$, metadata, 'acceptedDate', 'accepted'));
    historyEl.append(_exportDate($$, metadata, 'receivedDate', 'received'));
    historyEl.append(_exportDate($$, metadata, 'revReceivedDate', 'rev-recd'));
    historyEl.append(_exportDate($$, metadata, 'revRequestedDate', 'rev-request'));
    // do not export <history> tag if there is no dates inside
    if (historyEl.getChildCount() > 0) {
      articleMeta.append(historyEl);
    }

    // permissions?,
    if (permission && !permission.isEmpty()) {
      articleMeta.append(
        jatsExporter.convertNode(permission)
      );
    }

    // self-uri*,        // not supported yet

    // related-article*, // not supported yet

    // related-object*,  // not supported yet

    // abstract?,
    articleMeta.append(
      _exportAbstract(jats, doc, jatsExporter)
    );

    // trans-abstract*, // not yet supported

    // kwd-group*,
    articleMeta.append(
      _exportKeywords(jats, doc, jatsExporter)
    );

    // funding-group*,
    articleMeta.append(
      _exportFunders(jats, doc)
    );

    // conference*,      // not supported yet

    // counts?,          // not supported yet

    // custom-meta-group?  // not supported yet

    // replace the <article-meta> element
    let front = jats.find('article > front');
    let oldArticleMeta = front.find('article-meta');
    front.replaceChild(oldArticleMeta, articleMeta);
  }

  function _exportSubjects (jats, doc) {
    // NOTE: subjects are used to populate <article-categories>
    // - subjects are organized flat, not hierarchically
    // - `subject.category` is mapped to subject[content-type]
    // - subjects are grouped into <subj-groups> using their language property
    // group subjects by language
    // TODO: this should come from the article node
    let $$ = jats.$$;
    let subjects = doc.resolve(['metadata', 'subjects']);
    // TODO: remove or rework translations of subjects
    let byLang = subjects.reduce((byLang, subject) => {
      let lang = subject.language;
      if (!byLang[lang]) {
        byLang[lang] = [];
      }
      byLang[lang].push(subject);
      return byLang
    }, {});
    let articleCategories = $$('article-categories');
    substance.forEach(byLang, (subjects, lang) => {
      let groupEl = $$('subj-group');
      if (lang !== 'undefined') {
        groupEl.attr('xml:lang', lang);
      }
      groupEl.append(
        subjects.map(subject => {
          return $$('subject').attr({ 'content-type': subject.category }).text(subject.name)
        })
      );
      articleCategories.append(groupEl);
    });
    // only return if there have been converted subjects
    if (articleCategories.getChildCount() > 0) {
      return articleCategories
    }
  }

  function _exportTitleGroup (jats, doc, jatsExporter) {
    let $$ = jats.$$;
    // ATTENTION: ATM only title and subtitle is supported
    // JATS supports more titles beyond this (e.g. for special purposes)
    const TITLE_PATH = ['article', 'title'];
    const SUBTITLE_PATH = ['article', 'subTitle'];
    let titleGroupEl = $$('title-group');
    let articleTitle = $$('article-title');
    _exportAnnotatedText(jatsExporter, TITLE_PATH, articleTitle);
    titleGroupEl.append(articleTitle);

    // Export subtitle if it's not empty
    if (doc.get(SUBTITLE_PATH)) {
      let articleSubTitle = $$('subtitle');
      _exportAnnotatedText(jatsExporter, SUBTITLE_PATH, articleSubTitle);
      titleGroupEl.append(articleSubTitle);
    }

    return titleGroupEl
  }

  function _exportContribGroup (jats, doc, exporter, collectionPath, type) {
    // FIXME: this should not happen if we have general support for 'person-groups'
    // ATM, we only support authors, and editors.
    let $$ = jats.$$;
    let contribs = doc.resolve(collectionPath);
    let contribGroupEl = $$('contrib-group').attr('content-type', type);
    let groupedContribs = _groupContribs(contribs);
    for (let [groupId, persons] of groupedContribs) {
      // append persons without a group first
      if (groupId === 'NOGROUP') {
        persons.forEach(person => {
          contribGroupEl.append(_exportPerson($$, exporter, person));
        });
      // persons within a group are nested into an extra <contrib> layer
      } else {
        let group = doc.get(groupId);
        contribGroupEl.append(_exportGroup($$, exporter, group, persons));
      }
    }
    if (contribGroupEl.getChildCount() > 0) {
      return contribGroupEl
    }
  }

  /*
    Uses group association of person nodes to create groups

    [p1,p2g1,p3g2,p4g1] => {p1: p1, g1: [p2,p4], g2: [p3] }
  */
  function _groupContribs (contribs) {
    let groups = new Map();
    groups.set('NOGROUP', []);
    for (let contrib of contribs) {
      let groupId = contrib.group;
      if (groupId) {
        if (!groups.has(groupId)) {
          groups.set(groupId, []);
        }
        groups.get(groupId).push(contrib);
      } else {
        groups.get('NOGROUP').push(contrib);
      }
    }
    return groups
  }

  function _exportPerson ($$, exporter, node) {
    let el = $$('contrib').attr({
      'id': node.id,
      'contrib-type': 'person',
      'equal-contrib': node.equalContrib ? 'yes' : 'no',
      'corresp': node.corresp ? 'yes' : 'no',
      'deceased': node.deceased ? 'yes' : 'no'
    });
    el.append(
      $$('name').append(
        _createTextElement($$, node.surname, 'surname'),
        _createTextElement($$, node.givenNames, 'given-names'),
        _createTextElement($$, node.prefix, 'prefix'),
        _createTextElement($$, node.suffix, 'suffix')
      ),
      _createTextElement($$, node.email, 'email'),
      _createTextElement($$, node.alias, 'string-name', { 'content-type': 'alias' }),
      _createBioElement($$, exporter, node)
    );
    node.affiliations.forEach(affiliationId => {
      el.append(
        $$('xref').attr('ref-type', 'aff').attr('rid', affiliationId)
      );
    });
    node.funders.forEach(funderId => {
      el.append(
        $$('xref').attr('ref-type', 'award').attr('rid', funderId)
      );
    });
    return el
  }

  function _createBioElement ($$, exporter, node) {
    let content = node.resolve('bio');
    if (content.length > 0) {
      // NOTE: we don't want to export empty containers
      // e.g. if there is only one empty paragraph we are not exporting anything
      let first = content[0];
      if (content.length === 1 && first.isText() && first.isEmpty()) {
        return
      }
      let bioEl = $$('bio').append(
        content.map(p => exporter.convertNode(p))
      );
      return bioEl
    }
  }

  function _exportGroup ($$, exporter, node, groupMembers) {
    /*
      <contrib id="${node.id}" contrib-type="group" equal-contrib="yes|no" corresp="yes|no">
        <collab>
          <named-content content-type="name">${node.name}</named-content>
          <email>${node.email}</email>
          <$ for (let affId of node.affiliations) {$>
            <xref ref-type="aff" rid=${affId} />
          <$ } $>
          <$ for (let awardId of node.awards) {$>
            <xref ref-type="award" rid=${awardId} />
          <$ } $>
          <contrib-group contrib-type="group-member">
            <$ for (let person of groupMembers) {$>
              <Person node=${person} />
            <$ } $>
          </contrib-group>
          </collab>
      </contrib>
    */
    let contribEl = $$('contrib').attr({
      'id': node.id,
      'contrib-type': 'group',
      'equal-contrib': node.equalContrib ? 'yes' : 'no',
      'corresp': node.corresp ? 'yes' : 'no'
    });
    let collab = $$('collab');
    collab.append(
      $$('named-content').attr('content-type', 'name').append(node.name),
      $$('email').append(node.email)
    );
    // Adds affiliations to group
    node.affiliations.forEach(affiliationId => {
      collab.append(
        $$('xref').attr('ref-type', 'aff').attr('rid', affiliationId)
      );
    });
    // Add funders to group
    node.funders.forEach(funderId => {
      collab.append(
        $$('xref').attr('ref-type', 'award').attr('rid', funderId)
      );
    });
    // Add group members
    // <contrib-group contrib-type="group-member">
    let contribGroup = $$('contrib-group').attr('contrib-type', 'group-member');
    groupMembers.forEach(person => {
      let contribEl = _exportPerson($$, exporter, person);
      contribGroup.append(contribEl);
    });
    collab.append(contribGroup);
    contribEl.append(collab);
    return contribEl
  }

  function _exportAffiliations (jats, doc) {
    let $$ = jats.$$;
    let affiliations = doc.resolve(['metadata', 'affiliations']);
    let orgEls = affiliations.map(node => {
      let el = $$('aff').attr('id', node.id);
      el.append(_createTextElement($$, node.institution, 'institution', { 'content-type': 'orgname' }));
      el.append(_createTextElement($$, node.division1, 'institution', { 'content-type': 'orgdiv1' }));
      el.append(_createTextElement($$, node.division2, 'institution', { 'content-type': 'orgdiv2' }));
      el.append(_createTextElement($$, node.division3, 'institution', { 'content-type': 'orgdiv3' }));
      el.append(_createTextElement($$, node.street, 'addr-line', { 'content-type': 'street-address' }));
      el.append(_createTextElement($$, node.addressComplements, 'addr-line', { 'content-type': 'complements' }));
      el.append(_createTextElement($$, node.city, 'city'));
      el.append(_createTextElement($$, node.state, 'state'));
      el.append(_createTextElement($$, node.postalCode, 'postal-code'));
      el.append(_createTextElement($$, node.country, 'country'));
      el.append(_createTextElement($$, node.phone, 'phone'));
      el.append(_createTextElement($$, node.fax, 'fax'));
      el.append(_createTextElement($$, node.email, 'email'));
      el.append(_createTextElement($$, node.uri, 'uri', { 'content-type': 'link' }));
      return el
    });
    return orgEls
  }

  function _exportDate ($$, node, prop, dateType, tag) {
    const date = node[prop];
    // Do not export a date without value
    if (!date) return

    const tagName = tag || 'date';
    const el = $$(tagName).attr('date-type', dateType)
      .attr('iso-8601-date', date);

    const year = date.split('-')[0];
    const month = date.split('-')[1];
    const day = date.split('-')[2];
    if (_isDateValid(date)) {
      el.append(
        $$('day').append(day),
        $$('month').append(month),
        $$('year').append(year)
      );
    } else if (_isYearMonthDateValid(date)) {
      el.append(
        $$('month').append(month),
        $$('year').append(year)
      );
    } else if (_isYearDateValid(date)) {
      el.append(
        $$('year').append(year)
      );
    }
    return el
  }

  function _isDateValid (str) {
    const regexp = /^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/;
    if (!regexp.test(str)) return false
    return true
  }

  function _isYearMonthDateValid (str) {
    const regexp = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
    if (!regexp.test(str)) return false
    return true
  }

  function _isYearDateValid (str) {
    const regexp = /^[0-9]{4}$/;
    if (!regexp.test(str)) return false
    return true
  }

  function _createTextElement ($$, text, tagName, attrs) {
    if (text) {
      let el = $$(tagName).append(text);
      substance.forEach(attrs, (value, key) => {
        el.attr(key, value);
      });
      return el
    }
  }

  /**
   * @param {DOMElement} jats the JATS DOM to export into
   * @param {Document} doc the document to convert from
   * @param {XMLExporter} jatsExporter an exporter instance used to export nested nodes
   */
  function _exportAbstract (jats, doc, jatsExporter) {
    const $$ = jats.$$;
    let sectionContainerConverter = new SectionContainerConverter();
    let abstract = doc.get('abstract');
    let els = [];
    // Main abstract
    let abstractEl = $$('abstract');
    // the abstract element itself is required
    // but we skip empty content
    if (!_isContainerEmpty(abstract, 'content')) {
      sectionContainerConverter.export(abstract, abstractEl, jatsExporter);
    }
    els.push(abstractEl);
    // Custom abstracts
    doc.resolve(['article', 'customAbstracts']).forEach(customAbstract => {
      let customAbstractEl = $$('abstract');
      if (customAbstract.abstractType) {
        customAbstractEl.attr('abstract-type', customAbstract.abstractType);
      }
      if (customAbstract.title) {
        let titleEl = $$('title');
        _exportAnnotatedText(jatsExporter, [customAbstract.id, 'title'], titleEl);
        customAbstractEl.append(titleEl);
      }
      if (!_isContainerEmpty(customAbstract, 'content')) {
        sectionContainerConverter.export(customAbstract, customAbstractEl, jatsExporter);
      }
      els.push(customAbstractEl);
    });

    return els
  }

  function _exportKeywords (jats, doc, jatsExporter) {
    const $$ = jats.$$;
    // TODO: remove or rework tranlations of keywords
    const keywords = doc.resolve(['metadata', 'keywords']);
    let byLang = keywords.reduce((byLang, keyword) => {
      let lang = keyword.language;
      if (!byLang[lang]) {
        byLang[lang] = [];
      }
      byLang[lang].push(keyword);
      return byLang
    }, {});
    let keywordGroups = [];
    substance.forEach(byLang, (keywords, lang) => {
      let groupEl = $$('kwd-group');
      if (lang !== 'undefined') {
        groupEl.attr('xml:lang', lang);
      }
      groupEl.append(
        keywords.map(keyword => {
          return $$('kwd').attr({ 'content-type': keyword.category }).append(
            jatsExporter.annotatedText([keyword.id, 'name'])
          )
        })
      );
      keywordGroups.push(groupEl);
    });
    return keywordGroups
  }

  function _exportFunders (jats, doc) {
    const $$ = jats.$$;
    let funders = doc.resolve(['metadata', 'funders']);
    if (funders.length > 0) {
      let fundingGroupEl = $$('funding-group');
      funders.forEach(funder => {
        let el = $$('award-group').attr('id', funder.id);
        let institutionWrapEl = $$('institution-wrap');
        institutionWrapEl.append(_createTextElement($$, funder.fundRefId, 'institution-id', { 'institution-id-type': 'FundRef' }));
        institutionWrapEl.append(_createTextElement($$, funder.institution, 'institution'));
        el.append(
          $$('funding-source').append(institutionWrapEl),
          _createTextElement($$, funder.awardId, 'award-id')
        );
        fundingGroupEl.append(el);
      });
      return fundingGroupEl
    }
  }

  function _populateBody (jats, doc, jatsExporter) {
    let body = doc.get('body');
    if (!_isContainerEmpty(body, 'content')) {
      let bodyEl = jatsExporter.convertNode(body);
      let oldBody = jats.find('article > body');
      oldBody.parentNode.replaceChild(oldBody, bodyEl);
    }
  }

  function _populateBack (jats, doc, jatsExporter) {
    let $$ = jats.$$;
    let backEl = jats.find('article > back');
    /*
      back:
      (
        fn-group?,
        ref-list?,
      )
    */
    let footnotes = doc.resolve(['article', 'footnotes']);
    if (footnotes.length > 0) {
      backEl.append(
        $$('fn-group').append(
          footnotes.map(footnote => {
            return jatsExporter.convertNode(footnote)
          })
        )
      );
    }

    let references = doc.resolve(['article', 'references']);
    if (references.length > 0) {
      backEl.append(
        $$('ref-list').append(
          references.map(ref => {
            return jatsExporter.convertNode(ref)
          })
        )
      );
    }
  }

  function _exportAnnotatedText (jatsExporter, path, el) {
    el.append(jatsExporter.annotatedText(path));
  }

  function _isContainerEmpty (node, propertyName) {
    let ids = node[propertyName];
    if (ids.length === 0) return true
    if (ids.length > 1) return false
    let doc = node.getDocument();
    let first = doc.get(ids[0]);
    return first && first.isText() && !first.getText()
  }

  class ArticleJATSExporter extends substance.XMLExporter {
    /*
      Takes a InternalArticle document as a DOM and transforms it into a JATS document,
      following TextureArticle guidelines.
    */
    export (doc) {
      // TODO: consolidate DOMExporter / XMLExporter
      this.state.doc = doc;
      let jats = internal2jats(doc, this);
      return {
        jats,
        ok: true,
        errors: []
      }
    }

    getNodeConverter (node) {
      let type = node.type;
      if (node.isInstanceOf('reference')) {
        type = 'reference';
      }
      return this.converters.get(type)
    }

    // TODO: try to improve the core implementation to allow disabling of defaultBlockConverter
    convertNode (node) {
      if (substance.isString(node)) {
        // Assuming this.state.doc has been set by convertDocument
        node = this.state.doc.get(node);
      } else {
        this.state.doc = node.getDocument();
      }
      var converter = this.getNodeConverter(node);
      // special treatment for annotations, i.e. if someone calls
      // `exporter.convertNode(anno)`
      if (node.isPropertyAnnotation() && (!converter || !converter.export)) {
        return this._convertPropertyAnnotation(node)
      }
      if (!converter) {
        throw new Error(`No converter found for node type '${node.type}'`)
      }
      var el;
      if (converter.tagName) {
        el = this.$$(converter.tagName);
      } else {
        el = this.$$('div');
      }
      el.attr(this.idAttribute, node.id);
      if (converter.export) {
        el = converter.export(node, el, this) || el;
      }
      return el
    }
  }

  /*
    EXPERIMENTAL: an 'Editing' interface that takes the XML schema into account.
    TODO: try to generalize this and add it to the 'app dev kit'
  */
  class ArticleEditingImpl extends substance.Editing {
    /*
      2.0 API suggestion (pass only id, not data)
    */
    insertInlineNode (tx, node) {
      let text = '\uFEFF';
      this.insertText(tx, text);
      let sel = tx.selection;
      let endOffset = tx.selection.end.offset;
      let startOffset = endOffset - text.length;
      // TODO: introduce a coordinate operation for that
      tx.set([node.id, 'start', 'path'], sel.path);
      tx.set([node.id, 'start', 'offset'], startOffset);
      tx.set([node.id, 'end', 'path'], sel.path);
      tx.set([node.id, 'end', 'offset'], endOffset);
      return node
    }

    createListNode (tx, containerPath, params) {
      let prop = tx.getProperty(containerPath);
      if (prop.targetTypes.has('list')) {
        return tx.create({ type: 'list', listType: params.listType })
      } else {
        throw new Error(`'list' is not a valid child node for ${containerPath}`)
      }
    }

    insertBlockNode (tx, node) {
      // HACK: deviating from the current implementation
      // to replace selected node, because it happens quite often
      let sel = tx.selection;
      if (sel.isNodeSelection() && sel.mode !== 'before') {
        tx.setSelection(Object.assign(sel.toJSON(), { mode: 'after' }));
      }
      super.insertBlockNode(tx, node);
    }

    indent (tx) {
      let sel = tx.selection;
      if (sel.isPropertySelection()) {
        let nodeId = sel.start.getNodeId();
        let node = tx.get(nodeId);
        if (node.canIndent) {
          node.indent();
        }
      }
    }

    dedent (tx) {
      let sel = tx.selection;
      if (sel.isPropertySelection()) {
        let nodeId = sel.start.getNodeId();
        let node = tx.get(nodeId);
        if (node.canDedent) {
          node.dedent();
        }
      }
    }
  }

  class InternalArticleDocument extends substance.Document {
    getRootNode () {
      return this.get('article')
    }

    createEditingInterface () {
      return new substance.EditingInterface(this, { editing: new ArticleEditingImpl() })
    }

    find (selector) {
      return this.getRootNode().find(selector)
    }

    findAll (selector) {
      return this.getRootNode().findAll(selector)
    }

    getTitle () {
      this.resolve(['article', 'title']);
    }

    invert (change) {
      let inverted = change.invert();
      let info = inverted.info || {};
      switch (change.info.action) {
        case 'insertRows': {
          info.action = 'deleteRows';
          break
        }
        case 'deleteRows': {
          info.action = 'insertRows';
          break
        }
        case 'insertCols': {
          info.action = 'deleteCols';
          break
        }
        case 'deleteCols': {
          info.action = 'insertCols';
          break
        }
        default:
          //
      }
      inverted.info = info;
      return inverted
    }

    // Overridden to retain the original docType
    newInstance () {
      let doc = super.newInstance();
      doc.docType = this.docType;
      return doc
    }

    static createEmptyArticle (schema) {
      let doc = new InternalArticleDocument(schema);
      substance.documentHelpers.createNodeFromJson(doc, {
        type: 'article',
        id: 'article',
        metadata: {
          type: 'metadata',
          id: 'metadata',
          permission: {
            type: 'permission',
            id: 'permission'
          }
        },
        abstract: {
          type: 'abstract',
          id: 'abstract',
          content: [{ type: 'paragraph' }]
        },
        body: {
          type: 'body',
          id: 'body'
        }
      });
      doc.docType = DEFAULT_JATS_SCHEMA_ID;
      return doc
    }
  }

  function jats2internal (jats, doc, jatsImporter) {
    // metadata
    _populateAffiliations(doc, jats);
    _populateAuthors(doc, jats, jatsImporter);
    _populateEditors(doc, jats, jatsImporter);
    _populateFunders(doc, jats);
    _populateArticleInfo(doc, jats, jatsImporter);
    _populateKeywords(doc, jats, jatsImporter);
    _populateSubjects(doc, jats);

    // content
    _populateTitle(doc, jats, jatsImporter);
    _populateSubTitle(doc, jats, jatsImporter);
    _populateAbstract(doc, jats, jatsImporter);
    _populateBody$1(doc, jats, jatsImporter);
    _populateFootnotes(doc, jats, jatsImporter);
    _populateReferences(doc, jats, jatsImporter);

    return doc
  }

  function _populateAffiliations (doc, jats) {
    const affEls = jats.findAll('article > front > article-meta > aff');
    let orgIds = affEls.map(el => {
      let org = {
        id: el.id,
        type: 'affiliation',
        institution: getText(el, 'institution[content-type=orgname]'),
        division1: getText(el, 'institution[content-type=orgdiv1]'),
        division2: getText(el, 'institution[content-type=orgdiv2]'),
        division3: getText(el, 'institution[content-type=orgdiv3]'),
        street: getText(el, 'addr-line[content-type=street-address]'),
        addressComplements: getText(el, 'addr-line[content-type=complements]'),
        city: getText(el, 'city'),
        state: getText(el, 'state'),
        postalCode: getText(el, 'postal-code'),
        country: getText(el, 'country'),
        phone: getText(el, 'phone'),
        fax: getText(el, 'fax'),
        email: getText(el, 'email'),
        uri: getText(el, 'uri[content-type=link]')
      };
      return doc.create(org).id
    });
    doc.set(['metadata', 'affiliations'], orgIds);
  }

  function _populateAuthors (doc, jats, importer) {
    let authorEls = jats.findAll(`contrib-group[content-type=author] > contrib`);
    _populateContribs(doc, jats, importer, ['metadata', 'authors'], authorEls);
  }

  function _populateEditors (doc, jats, importer) {
    let editorEls = jats.findAll(`contrib-group[content-type=editor] > contrib`);
    _populateContribs(doc, jats, importer, ['metadata', 'editors'], editorEls);
  }

  function _populateContribs (doc, jats, importer, contribsPath, contribEls, groupId) {
    for (let contribEl of contribEls) {
      if (contribEl.attr('contrib-type') === 'group') {
        // ATTENTION: groups are defined 'inplace'
        // the members of the group are appended to the list of persons
        let group = {
          id: contribEl.id,
          type: 'group',
          name: getText(contribEl, 'named-content[content-type=name]'),
          email: getText(contribEl, 'email'),
          affiliations: _getAffiliationIds(contribEl, true),
          equalContrib: contribEl.getAttribute('equal-contrib') === 'yes',
          corresp: contribEl.getAttribute('corresp') === 'yes',
          funders: _getAwardIds(contribEl)
        };
        substance.documentHelpers.append(doc, ['metadata', 'groups'], doc.create(group).id);

        let memberEls = contribEl.findAll('contrib');
        _populateContribs(doc, jats, importer, contribsPath, memberEls, group.id);
      } else {
        let contrib = doc.create({
          id: contribEl.id,
          type: 'person',
          givenNames: getText(contribEl, 'given-names'),
          surname: getText(contribEl, 'surname'),
          email: getText(contribEl, 'email'),
          alias: getText(contribEl, 'string-name[content-type=alias]'),
          prefix: getText(contribEl, 'prefix'),
          suffix: getText(contribEl, 'suffix'),
          affiliations: _getAffiliationIds(contribEl),
          funders: _getAwardIds(contribEl),
          bio: _getBioContent(contribEl, importer),
          equalContrib: contribEl.getAttribute('equal-contrib') === 'yes',
          corresp: contribEl.getAttribute('corresp') === 'yes',
          deceased: contribEl.getAttribute('deceased') === 'yes',
          group: groupId
        });
        substance.documentHelpers.append(doc, contribsPath, contrib.id);
      }
    }
  }

  // ATTENTION: bio is not a specific node anymore, just a collection of paragraphs
  function _getBioContent (el, importer) {
    let $$ = el.createElement.bind(el.getOwnerDocument());
    let bioEl = findChild(el, 'bio');

    // If there is no bio element we should provide it
    if (!bioEl) {
      bioEl = $$('bio');
    }

    // TODO: this code looks similar to what we have in abstract or and caption
    // drop everything other than 'p' from bio
    retainChildren(bioEl, 'p');
    // there must be at least one paragraph
    if (!bioEl.find('p')) {
      bioEl.append($$('p'));
    }

    return bioEl.children.map(child => importer.convertElement(child).id)
  }

  function _getAffiliationIds (el, isGroup) {
    // let dom = el.ownerDocument
    let xrefs = el.findAll('xref[ref-type=aff]');
    // NOTE: for groups we need to extract only affiliations of group, without members
    if (isGroup) {
      xrefs = el.findAll('collab > xref[ref-type=aff]');
    }
    let affs = xrefs.map(xref => xref.attr('rid'));
    return affs
  }

  function _getAwardIds (el) {
    let xrefs = el.findAll('xref[ref-type=award]');
    let awardIds = xrefs.map(xref => xref.attr('rid'));
    return awardIds
  }

  function _populateFunders (doc, jats) {
    const awardEls = jats.findAll('article > front > article-meta > funding-group > award-group');
    let funderIds = awardEls.map(el => {
      let funder = {
        id: el.id,
        type: 'funder',
        institution: getText(el, 'institution'),
        fundRefId: getText(el, 'institution-id'),
        awardId: getText(el, 'award-id')
      };
      return doc.create(funder).id
    });
    doc.set(['metadata', 'funders'], funderIds);
  }

  // TODO: use doc API for manipulation, not a bare object
  function _populateArticleInfo (doc, jats, jatsImporter) {
    let articleEl = jats.find('article');
    let articleMetaEl = articleEl.find('front > article-meta');
    let metadata = doc.get('metadata');
    Object.assign(metadata, {
      articleType: articleEl.getAttribute('article-type') || '',
      elocationId: getText(articleMetaEl, 'elocation-id'),
      fpage: getText(articleMetaEl, 'fpage'),
      lpage: getText(articleMetaEl, 'lpage'),
      issue: getText(articleMetaEl, 'issue'),
      volume: getText(articleMetaEl, 'volume'),
      pageRange: getText(articleMetaEl, 'page-range')
    });
    let issueTitleEl = findChild(articleMetaEl, 'issue-title');
    if (issueTitleEl) {
      metadata['issueTitle'] = jatsImporter.annotatedText(issueTitleEl, ['metadata', 'issueTtle']);
    }
    // Import permission if present
    const permissionsEl = articleMetaEl.find('permissions');
    // An empty permission is already there, but will be replaced if <permission> element is there
    if (permissionsEl) {
      doc.delete(metadata.permission);
      let permission = jatsImporter.convertElement(permissionsEl);
      // ATTENTION: so that the document model is correct we need to use
      // the Document API  to set the permission id
      metadata.permission = permission.id;
    }

    const articleDateEls = articleMetaEl.findAll('history > date, pub-date');
    if (articleDateEls.length > 0) {
      let dates = {};
      articleDateEls.forEach(dateEl => {
        const date = _extractDate(dateEl);
        dates[date.type] = date.value;
      });
      Object.assign(metadata, dates);
    }
  }

  const DATE_TYPES_MAP = {
    'pub': 'publishedDate',
    'accepted': 'acceptedDate',
    'received': 'receivedDate',
    'rev-recd': 'revReceivedDate',
    'rev-request': 'revRequestedDate'
  };

  function _extractDate (el) {
    const dateType = el.getAttribute('date-type');
    const value = el.getAttribute('iso-8601-date');
    const entityProp = DATE_TYPES_MAP[dateType];
    return {
      value: value,
      type: entityProp
    }
  }

  function _populateKeywords (doc, jats, jatsImporter) {
    let kwdEls = jats.findAll('article > front > article-meta > kwd-group > kwd');
    let kwdIds = kwdEls.map(kwdEl => {
      const kwd = doc.create({
        type: 'keyword',
        category: kwdEl.getAttribute('content-type'),
        language: kwdEl.getParent().getAttribute('xml:lang')
      });
      kwd.name = jatsImporter.annotatedText(kwdEl, [kwd.id, 'name']);
      return kwd.id
    });
    doc.get('metadata').keywords = kwdIds;
  }

  function _populateSubjects (doc, jats) {
    // TODO: IMO we need to consolidate this. The original meaning of <subj-group> seems to be
    // to be able to define an ontology, also hierarchically
    // This implementation assumes that subjects are flat.
    // To support translations, multiple subj-groups can be provided with different xml:lang
    let subjGroups = jats.findAll('article > front > article-meta > article-categories > subj-group');
    // TODO: get this from the article element
    const DEFAULT_LANG = 'en';
    for (let subjGroup of subjGroups) {
      let language = subjGroup.attr('xml:lang') || DEFAULT_LANG;
      let subjectEls = subjGroup.findAll('subject');
      for (let subjectEl of subjectEls) {
        let subject = doc.create({
          type: 'subject',
          name: subjectEl.textContent,
          category: subjectEl.getAttribute('content-type'),
          language
        });
        substance.documentHelpers.append(doc, ['metadata', 'subjects'], subject.id);
      }
    }
  }

  function _populateTitle (doc, jats, jatsImporter) {
    let article = doc.get('article');
    let titleEl = jats.find('article > front > article-meta > title-group > article-title');
    if (titleEl) {
      article.title = jatsImporter.annotatedText(titleEl, ['article', 'title']);
    }
    // FIXME: bring back translations
    // translations
    // let transTitleEls = jats.findAll('article > front > article-meta > title-group > trans-title-group > trans-title')
    // for (let transTitleEl of transTitleEls) {
    //   let group = transTitleEl.parentNode
    //   let language = group.attr('xml:lang')
    //   let translation = doc.create({
    //     type: 'article-title-translation',
    //     id: transTitleEl.id,
    //     source: ['article', 'title'],
    //     language
    //   })
    //   translation.content = jatsImporter.annotatedText(transTitleEl, translation.getPath())
    //   documentHelpers.append(doc, ['article', 'translations'], translation.id)
    // }
  }

  function _populateSubTitle (doc, jats, jatsImporter) {
    let article = doc.get('article');
    let subTitleEl = jats.find('article > front > article-meta > title-group > subtitle');
    if (subTitleEl) {
      article.subTitle = jatsImporter.annotatedText(subTitleEl, ['article', 'subTitle']);
    }
  }

  function _populateAbstract (doc, jats, jatsImporter) {
    let $$ = jats.createElement.bind(jats);
    let sectionContainerConverter = new SectionContainerConverter();

    // NOTE: The first abstract without abstract-type is used as main abstract,
    // if there are others they should be imported as a custom abstract
    // as well as abstracts with abstract-type attribute
    let mainAbstract = doc.get('abstract');
    let abstractEls = jats.findAll('article > front > article-meta > abstract');
    let mainAbstractImported = false;
    abstractEls.forEach(abstractEl => {
      const titleEl = findChild(abstractEl, 'title');
      if (titleEl) {
        abstractEl.removeChild(titleEl);
      }
      // if the abstract is empty, add an empty paragraph
      if (abstractEl.getChildCount() === 0) {
        abstractEl.append($$('p'));
      }
      const abstractType = abstractEl.attr('abstract-type');
      if (!abstractType && !mainAbstractImported) {
        sectionContainerConverter.import(abstractEl, mainAbstract, jatsImporter);
        mainAbstractImported = true;
      } else {
        let abstract = doc.create({
          type: 'custom-abstract',
          id: abstractEl.id,
          abstractType: abstractType
        });
        sectionContainerConverter.import(abstractEl, abstract, jatsImporter);
        if (titleEl) {
          abstract.title = jatsImporter.annotatedText(titleEl, [abstract.id, 'title']);
        }
        substance.documentHelpers.append(doc, ['article', 'customAbstracts'], abstract.id);
      }
    });

    // FIXME: bring back translations
    // translations
    // let transAbstractEls = jats.findAll('article > front > article-meta > trans-abstract')
    // for (let transAbstractEl of transAbstractEls) {
    //   let language = transAbstractEl.attr('xml:lang')
    //   let translation = doc.create({
    //     type: 'article-abstract-translation',
    //     id: transAbstractEl.id,
    //     source: [mainAbstract.id, 'content'],
    //     language,
    //     content: transAbstractEl.getChildren().map(child => {
    //       return jatsImporter.convertElement(child).id
    //     })
    //   })
    //   documentHelpers.append(doc, ['article', 'translations'], translation.id)
    // }
  }

  function _populateBody$1 (doc, jats, jatsImporter) {
    let $$ = jats.createElement.bind(jats);
    // ATTENTION: JATS can have multiple abstracts
    // ATM we only take the first, loosing the others
    let bodyEl = jats.find('article > body');
    if (bodyEl) {
      // add an empty paragraph if the body is empty
      if (bodyEl.getChildCount() === 0) {
        bodyEl.append($$('p'));
      }
      let body = doc.get('body');
      // ATTENTION: because there is already a body node in the document, *the* body, with id 'body'
      // we must change the id of the body element so that it does not collide with the internal one
      bodyEl.id = substance.uuid();
      let tmp = jatsImporter.convertElement(bodyEl);
      let ids = tmp.content.slice();
      tmp.content = [];
      body.content = ids;
      doc.delete(tmp);
    }
  }

  function _populateFootnotes (doc, jats, jatsImporter) {
    let $$ = jats.createElement.bind(jats);
    let fnEls = jats.findAll('article > back > fn-group > fn');
    let article = doc.get('article');
    article.footnotes = fnEls.map(fnEl => {
      // there must be at least one paragraph
      if (!fnEl.find('p')) {
        fnEl.append($$('p'));
      }
      return jatsImporter.convertElement(fnEl).id
    });
  }

  function _populateReferences (doc, jats, jatsImporter) {
    // TODO: make sure that we only allow this place for references via restricting the TextureJATS schema
    let refListEl = jats.find('article > back > ref-list');
    if (refListEl) {
      let article = doc.get('article');
      let refEls = refListEl.findAll('ref');
      article.references = refEls.map(refEl => jatsImporter.convertElement(refEl).id);
    }
  }

  var UnsupportedInlineNodeConverter = {
    type: 'unsupported-inline-node',
    matchElement (el) {
      return false
    },
    import (el, node) {
      node.data = el.serialize();
    },
    export (node, el) {
      return substance.DefaultDOMElement.parseSnippet(node.data, 'xml')
    }
  };

  var UnsupportedNodeConverter = {
    type: 'unsupported-node',
    matchElement (el) {
      return false
    },
    import (el, node) {
      node.data = el.serialize();
    },
    export (node, el) {
      return substance.DefaultDOMElement.parseSnippet(node.data, 'xml')
    }
  };

  class ArticleJATSImporter extends substance.XMLImporter {
    import (jats, options = {}) {
      let doc = this.state.doc;
      jats2internal(jats, doc, this);
      return doc
    }

    annotatedText (el, path, options = {}) {
      const state = this.state;
      let context = substance.last(state.contexts);
      // In contrast to the core implementation we want to allow that this is method is used to convert properties
      // with annotated text, outside of a recursive import call
      if (!context) {
        state.pushContext(el.tagName);
      }
      let text = super.annotatedText(el, path, options);
      if (!context) {
        context = state.popContext();
        context.annos.forEach(nodeData => state.doc.create(nodeData));
      }
      return text
    }

    nextId (prefix) {
      // ATTENTION: we gonna use '_' as a prefix for automatically created ids
      // TODO: also do this for nodes created via Document
      let doc = this.state.doc;
      let id = this.state.uuid('_' + prefix);
      while (doc.get(id)) {
        id = this.state.uuid('_' + prefix);
      }
      return id
    }

    _createDocument () {
      return InternalArticleDocument.createEmptyArticle(this.state.doc.getSchema())
    }

    _getConverterForElement (el, mode) {
      let converter = super._getConverterForElement(el, mode);
      if (!converter) {
        if (mode === 'inline') {
          return UnsupportedInlineNodeConverter
        } else {
          return UnsupportedNodeConverter
        }
      }
      return converter
    }

    _convertInlineNode (el, nodeData, converter) {
      const path = [];
      if (converter.import) {
        nodeData = converter.import(el, nodeData, this) || nodeData;
      }
      nodeData.start = { path, offset: 0 };
      nodeData.end = { offset: 0 };
      return nodeData
    }

    _createNode (nodeData) {
      let doc = this.state.doc;
      let node = doc.get(nodeData.id);
      if (node) {
        throw new Error('Node already exists')
      }
      return doc.create(nodeData)
    }

    _createNodeData (el, type) {
      let nodeData = super._createNodeData(el, type);
      let attributes = {};
      el.getAttributes().forEach((value, key) => {
        attributes[key] = value;
      });
      nodeData.attributes = attributes;
      return nodeData
    }
  }

  class TextureConfigurator extends substance.Configurator {}

  function unwrapExports (x) {
  	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
  }

  function createCommonjsModule(fn, module) {
  	return module = { exports: {} }, fn(module, module.exports), module.exports;
  }

  var textureXmlUtils_cjs = createCommonjsModule(function (module, exports) {

  Object.defineProperty(exports, '__esModule', { value: true });



  const START = 'START';
  const END = 'END';
  const EPSILON = 'EPSILON';
  const TEXT = 'TEXT';

  class DFA {
    constructor (transitions) {
      if (!transitions || Object.keys(transitions).length === 0) {
        transitions = { START: { EPSILON: END } };
      }
      this.transitions = transitions;
    }

    consume (state, id) {
      const T = this.transitions;
      // e.g. this happens, if the state is already END
      // and more tokens are coming
      if (!T[state]) return -1
      let nextState = T[state][id];
      if (nextState !== undefined) {
        return nextState
      }
      while (T[state][EPSILON] !== undefined) {
        state = T[state][EPSILON];
        if (state === END) {
          return -1
        }
        nextState = T[state][id];
        if (nextState !== undefined) {
          return nextState
        }
      }
      return -1
    }

    canConsume (state, id) {
      let nextState = this.consume(state, id);
      return (nextState !== -1)
    }

    isFinished (state) {
      const T = this.transitions;
      if (state === 'END') return true
      // if the state is invalid
      if (!T[state]) return false
      while (T[state][EPSILON] !== undefined) {
        state = T[state][EPSILON];
        if (state === 'END') return true
      }
      return false
    }

    // Helpers to analyze

    // generates all sets of tokens, reached on all different paths
    _tokensByPath () {
      const result = [];
      const transitions = this.transitions;
      if (!transitions) return []

      // group start edges by follow state
      let first = {};
      substance__default.forEach(transitions[START], (to, token) => {
        if (!first[to]) first[to] = [];
        first[to].push(token);
      });

      let visited = { START: true, END: true };
      substance__default.forEach(first, (tokens, state) => {
        // walk all states that can be reached on this path
        // and collect all tokens
        // we consider them as potential siblings, as they
        // can co-occur at the same level
        let _siblings = {};
        tokens.forEach((t) => {
          if (t !== EPSILON) {
            _siblings[t] = true;
          }
        });
        let stack = [state];
        while (stack.length > 0) {
          let from = stack.pop();
          if (state === END) continue
          visited[from] = true;
          let T = transitions[from];
          if (!T) throw new Error(`Internal Error: no transition from state ${from}`)
          let tokens = Object.keys(T);
          for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const to = T[token];
            if (!visited[to]) stack.push(to);
            if (token !== EPSILON) {
              _siblings[token] = true;
            }
          }
        }
        let _siblingTokens = Object.keys(_siblings);
        if (_siblingTokens.length > 0) {
          result.push(_siblingTokens);
        }
      });
      return result
    }
  }

  DFA.START = START;
  DFA.END = END;
  DFA.EPSILON = EPSILON;
  DFA.TEXT = TEXT;

  const START$1 = DFA.START;
  const END$1 = DFA.END;
  const EPSILON$1 = DFA.EPSILON;

  /*
    DFABuilder is essentially a graph implementation
    helping to build DFAs incrementally, by composing smaller
    sub-DFAs.
  */
  class DFABuilder {
    constructor (transitions) {
      this.transitions = transitions;
    }

    addTransition (from, to, tokens) {
      if (!this.transitions) this.transitions = {};
      if (!substance__default.isArray(tokens)) tokens = [tokens];
      tokens.forEach(token => _addTransition(this.transitions, from, to, token));
      return this
    }

    /*
      Creates a new DFA with all state values shifted by a given offset.
      Used when appending this DFA to another one (-> sequence)

      ```
      Expression: A,B

      Graph:  S - [A] -> E
              S - [B] -> E
              =
              S - [A] -> N - [B] -> E
      ```
    */
    append (other) {
      if (this.transitions && other.transitions) {
        let t1 = substance__default.cloneDeep(this.transitions);
        let t2 = substance__default.cloneDeep(other.transitions);
        // we need to be careful with EPSILON transitions
        // so that don't end up having a NDFA.
        let firstIsOptional = Boolean(t1[START$1][EPSILON$1]);
        let secondIsOptional = Boolean(t2[START$1][EPSILON$1]);

        if (firstIsOptional) {
          // we remove the epsilon transition from the first
          // as it would be in the way for the transformations done below
          delete t1[START$1][EPSILON$1];
        }
        // for the concatenation we insert a new state and adapt
        // the transitions of the first and second DFA to use the new state
        let newState = substance__default.uuid();
        // let transitions of the first going to END
        // now point to the new state
        substance__default.forEach(t1, (T) => {
          substance__default.forEach(T, (to, token) => {
            if (to === END$1) {
              T[token] = newState;
            }
          });
        });
        // If the first is optional we add transitions from
        // START to the new state
        if (firstIsOptional) {
          substance__default.forEach(t2[START$1], (to, token) => {
            _addTransition(t1, START$1, to, token);
          });
        }
        // for concatenation we let transitions of the second DFA
        // going from and to START now go from and to the new state
        t2[newState] = t2[START$1];
        substance__default.forEach(t2, (T) => {
          substance__default.forEach(T, (to, token) => {
            if (to === START$1) {
              T[token] = newState;
            }
          });
        });
        delete t2[START$1];
        // and now we can merge in the transitions
        substance__default.forEach(t2, (T, from) => {
          substance__default.forEach(T, (to, token) => {
            _addTransition(t1, from, to, token);
          });
        });
        // finally we add back an EPSILON transition
        // if both DFAs were optional
        if (firstIsOptional && secondIsOptional) {
          _addTransition(t1, START$1, END$1, EPSILON$1);
        }
        this.transitions = t1;
      } else if (other.transitions) {
        this.transitions = substance__default.cloneDeep(other.transitions);
      }
      return this
    }

    /*
      Merges to DFAs.

      Used to implement choices.

      ```
      Expression: A | B

      Graph:     - [A] -
                /       \
              S          > E
                \       /
                 - [B] -

      ```
    */
    merge (other) {
      if (this.transitions && other.transitions) {
        let t1 = this.transitions;
        let t2 = other.transitions;
        substance__default.forEach(t2, (T, from) => {
          substance__default.forEach(T, (to, token) => {
            _addTransition(t1, from, to, token);
          });
        });
      } else if (other.transitions) {
        this.transitions = substance__default.cloneDeep(other.transitions);
      }
      return this
    }

    /*
      Creates a new DFA with same transitions
      plus an EPSILON transition from start to END

      ```
      Expression: A?

      Graph:     - [A] -
                /       \
              S          > E
                \       /
                 -  ε  -
      ```
    */
    optional () {
      let dfa = new DFABuilder(substance__default.cloneDeep(this.transitions));
      if (this.transitions) {
        dfa.addTransition(START$1, END$1, EPSILON$1);
      }
      return dfa
    }

    /*
      Creates a new DFA representing (A)*

      ```
      Expression: A* = (A+)?

                         /-[A]-\
                         |     |
                          \   /
                           v /
      Graph:   S -- [A] --> 1  -- ε -->  E
                \                    /
                 \   --    ε   --   /

      ```
    */
    kleene () {
      let dfa = this.plus();
      return dfa.optional()
    }

    /*
      Creates a new DFA representing (...)+ by concatenating this
      with a kleene version: A+ = A A*

      ```
      Expression: (A)+ (sequence and reflexive edge)

                         /-[A]-\
                         |     |
                          \   /
                           v /
      Graph:  S -- [A] -->  N  -- ε -> E

      ```
    */
    plus () {
      let dfa;
      if (this.transitions) {
        let t1 = substance__default.cloneDeep(this.transitions);
        // there might exist an EPSILON transition already
        // which we must remove to fulfill our internal
        // assumption that there is only one EPSILON transition from
        // START going to END
        const isOptional = Boolean(t1[START$1][EPSILON$1]);
        delete t1[START$1][EPSILON$1];
        // introduce a new state
        // and let all 'ending' edges point to new state
        let newState = substance__default.uuid();
        substance__default.forEach(t1, (T) => {
          substance__default.forEach(T, (to, token) => {
            if (to === END$1) {
              T[token] = newState;
            }
          });
        });
        // add 'ending' EPSILON transition
        _addTransition(t1, newState, END$1, EPSILON$1);
        // copy all starting edges
        substance__default.forEach(t1[START$1], (to, token) => {
          _addTransition(t1, newState, to, token);
        });
        // recover 'optional'
        if (isOptional) {
          _addTransition(t1, START$1, END$1, EPSILON$1);
        }
        dfa = new DFABuilder(t1);
      } else {
        dfa = new DFABuilder(substance__default.cloneDeep(this.transitions));
      }
      return dfa
    }
  }

  DFABuilder.singleToken = function (token) {
    let dfa = new DFABuilder();
    dfa.addTransition(START$1, END$1, token);
    return dfa
  };

  function _addTransition (transitions, from, to, token) {
    let T = transitions[from];
    if (!T) {
      transitions[from] = T = {};
    }
    if (token === EPSILON$1 && from === START$1 && to !== END$1) {
      throw new Error('The only EPSILON transition from START must be START->END')
    }
    if (T[token] && T[token] !== to) {
      console.error('Token %s already used. Ignoring this transition.', token);
      return
      // throw new Error('Token already used in this state')
    }
    T[token] = to;
  }

  const { START: START$2, END: END$2, TEXT: TEXT$1, EPSILON: EPSILON$2 } = DFA;

  // retains the structured representation
  // and compiles a DFA for efficient processing
  class Expression {
    // TODO: why does the expression need a name?
    constructor (name, root) {
      this.name = name;
      this.root = root;

      this._initialize();
    }

    _initialize () {
      this._compile();
    }

    toString () {
      return this.root.toString()
    }

    isAllowed (tagName) {
      return Boolean(this._allowedChildren[tagName])
    }

    /*
      Some structures get compiled into a DFA, for instance.
    */
    _compile () {
      this.root._compile();
    }

    _describeError (state, token) {
      let msg = [];
      if (token !== TEXT$1) {
        if (!this.isAllowed(token)) {
          msg.push(`<${token}> is not valid in <${this.name}>\nSchema: ${this.toString()}`);
        } else {
          // otherwise just the position is wrong
          msg.push(`<${token}> is not allowed at the current position in <${this.name}>.\n${this.toString()}`);
        }
      } else {
        msg.push(`TEXT is not allowed at the current position: ${state.trace.join(',')}\n${this.toString()}`);
      }
      return msg.join('')
    }
  }

  function createExpression (name, root) {
    if (root instanceof Interleave) {
      return new InterleaveExpr(name, root)
    } else {
      return new DFAExpr(name, root)
    }
  }

  class DFAExpr extends Expression {
    getInitialState () {
      return {
        dfaState: START$2,
        errors: [],
        trace: []
      }
    }

    consume (state, token) {
      const dfa = this.dfa;
      let oldState = state.dfaState;
      let newState = dfa.consume(oldState, token);
      state.dfaState = newState;
      if (newState === -1) {
        state.errors.push({
          msg: this._describeError(state, token),
          // HACK: we want to have the element with the errors
          // but actually, here we do not know about that context
          el: state.el
        });
        return false
      } else {
        state.trace.push(token);
        return true
      }
    }

    isFinished (state) {
      return this.dfa.isFinished(state.dfaState)
    }

    _initialize () {
      super._initialize();

      this._computeAllowedChildren();
    }

    _compile () {
      super._compile();
      this.dfa = new DFA(this.root.dfa.transitions);
    }

    _computeAllowedChildren () {
      this._allowedChildren = _collectAllTokensFromDFA(this.dfa);
    }

    _isValid (_tokens) {
      let state = this.getInitialState();
      for (let i = 0; i < _tokens.length; i++) {
        const token = _tokens[i];
        // Note: there might be some elements which
        // are not relevant, such as empty text nodes
        // or comments etc.
        if (!token) continue
        if (!this.consume(state, token)) {
          return false
        }
      }
      return this.isFinished(state)
    }
  }

  function _collectAllTokensFromDFA (dfa) {
    // Note: collecting all children
    const children = {};
    if (dfa.transitions) {
      substance__default.forEach(dfa.transitions, (T) => {
        Object.keys(T).forEach((tagName) => {
          if (tagName === EPSILON$2) return
          children[tagName] = true;
        });
      });
    }
    return children
  }

  class InterleaveExpr extends Expression {
    getInitialState () {
      const dfas = this.dfas;
      const dfaStates = new Array(dfas.length);
      dfaStates.fill(START$2);
      return {
        dfaStates,
        errors: [],
        trace: [],
        // maintain the index of the dfa which has been consumed the last token
        lastDFA: 0
      }
    }

    consume (state, token) {
      const idx = this._findNextDFA(state, token);
      if (idx < 0) {
        state.errors.push({
          msg: this._describeError(state, token)
        });
        return false
      } else {
        const dfa = this.dfas[idx];
        const oldState = state.dfaStates[idx];
        const newState = dfa.consume(oldState, token);
        state.dfaStates[idx] = newState;
        state.trace.push(token);
        return true
      }
    }

    isFinished (state) {
      const dfas = this.dfas;
      for (let i = 0; i < dfas.length; i++) {
        const dfa = dfas[i];
        const dfaState = state.dfaStates[i];
        if (!dfa.isFinished(dfaState)) {
          return false
        }
      }
      return true
    }

    _initialize () {
      super._initialize();

      this._computeAllowedChildren();
    }

    _compile () {
      super._compile();

      this.blocks = this.root.blocks;
      this.dfas = this.blocks.map(b => new DFA(b.dfa.transitions));
    }

    _computeAllowedChildren () {
      this._allowedChildren = Object.assign(...this.blocks.map((block) => {
        return _collectAllTokensFromDFA(block.dfa)
      }));
    }

    _findNextDFA (state, token) {
      console.assert(state.dfaStates.length === this.dfas.length);
      const dfas = this.dfas;
      for (let i = 0; i < state.dfaStates.length; i++) {
        const dfa = dfas[i];
        const dfaState = state.dfaStates[i];
        if (dfa.canConsume(dfaState, token)) {
          return i
        }
      }
      return -1
    }
  }

  class Token {
    constructor (name) {
      this.name = name;
    }

    toString () {
      return this.name
    }

    _compile () {
      this.dfa = DFABuilder.singleToken(this.name);
    }
  }

  class GroupExpression {
    constructor (blocks) {
      this.blocks = blocks;
    }

    toString () {
      return '(' + this.blocks.map(b => b.toString()).join(this.token) + ')'
    }
  }

  /*
    (a|b|c)
  */
  class Choice extends GroupExpression {
    // copy () {
    //   return new Choice(this.blocks.map(b => b.copy()))
    // }

    // _normalize () {
    //   const blocks = this.blocks
    //   for (let i = blocks.length - 1; i >= 0; i--) {
    //     let block = blocks[i]
    //     block._normalize()
    //     // unwrap doubled Choices
    //     if (block instanceof Choice) {
    //       blocks.splice(i, 1, ...(block.blocks))
    //     }
    //   }
    // }

    _compile () {
      let dfa = new DFABuilder();
      this.blocks.forEach((block) => {
        if (block instanceof Token) {
          dfa.addTransition(START$2, END$2, block.name);
        } else if (block instanceof Interleave) {
          throw new Error('Nested interleave blocks are not supported.')
        } else {
          if (!block.dfa) {
            block._compile();
          }
          dfa.merge(block.dfa);
        }
      });
      this.dfa = dfa;
      return dfa
    }

    get token () { return Choice.token }

    static get token () { return '|' }
  }

  /*
    (a,b,c) (= ordered)
  */
  class Sequence extends GroupExpression {
    // copy () {
    //   return new Sequence(this.blocks.map(b => b.copy()))
    // }

    _compile () {
      let dfa = new DFABuilder();
      this.blocks.forEach((block) => {
        if (block instanceof Token) {
          dfa.append(DFABuilder.singleToken(block.name));
        } else if (block instanceof Interleave) {
          throw new Error('Nested interleave blocks are not supported.')
        } else {
          if (!block.dfa) {
            block._compile();
          }
          dfa.append(block.dfa);
        }
      });
      this.dfa = dfa;
      return dfa
    }

    get token () { return Sequence.token }

    static get token () { return ',' }
  }

  /*
    ~(a,b,c) (= unordered)
  */
  class Interleave extends GroupExpression {
    // copy () {
    //   return new Interleave(this.blocks.map(b => b.copy()))
    // }

    toString () {
      return '(' + this.blocks.map(b => b.toString()).join(', ') + ')[unordered]'
    }

    _normalize () {}

    _compile () {
      this.blocks.forEach(block => block._compile());
    }

    get token () { return Interleave.token }

    static get token () { return '~' }
  }

  class BlockExpression {
    constructor (block) {
      this.block = block;
    }

    toString () {
      return this.block.toString() + this.token
    }
  }

  /*
    ()?
  */
  class Optional extends BlockExpression {
    // copy () {
    //   return new Optional(this.block.copy())
    // }

    _compile () {
      const block = this.block;
      if (block instanceof Interleave) {
        throw new Error('Nested interleave blocks are not supported.')
      }
      if (!block.dfa) {
        block._compile();
      }
      this.dfa = block.dfa.optional();
      return this.dfa
    }

    get token () { return Optional.token }

    static get token () { return '?' }
  }

  /*
    ()*
  */
  class Kleene extends BlockExpression {
    // copy () {
    //   return new Kleene(this.block.copy())
    // }

    _compile () {
      const block = this.block;
      if (block instanceof Interleave) {
        throw new Error('Nested interleave blocks are not supported.')
      }
      if (!block.dfa) {
        block._compile();
      }
      this.dfa = block.dfa.kleene();
      return this.dfa
    }

    get token () { return Kleene.token }

    static get token () { return '*' }
  }

  /*
    ()+
  */
  class Plus extends BlockExpression {
    // copy () {
    //   return new Plus(this.block.copy())
    // }

    _compile () {
      const block = this.block;
      if (block instanceof Interleave) {
        throw new Error('Nested interleave blocks are not supported.')
      }
      if (!block.dfa) {
        block._compile();
      }
      this.dfa = block.dfa.plus();
      return this.dfa
    }

    get token () { return Plus.token }

    static get token () { return '+' }
  }

  const { TEXT: TEXT$2 } = DFA;

  function analyze (elementSchemas) {
    substance__default.forEach(elementSchemas, elementSchema => {
      Object.assign(elementSchema, {
        children: {},
        parents: {},
        siblings: {},
        usedInlineBy: {},
        usedStructuredBy: {}
      });
    });
    substance__default.forEach(elementSchemas, elementSchema => {
      _analyzeElementSchema(elementSchema, elementSchemas);
    });
  }

  /*
   We use this to detect automatically, if an
   element is used as a text node or an element node,
   or both at the same time.
  */
  function _analyzeElementSchema (elementSchema, elementSchemas) {
    const expr = elementSchema.expr;
    const name = elementSchema.name;
    if (!expr) return
    let _siblings = [];
    if (expr instanceof DFAExpr) {
      if (expr.dfa) {
        _siblings = expr.dfa._tokensByPath();
      }
    } else if (expr instanceof InterleaveExpr) {
      expr.dfas.forEach((dfa) => {
        if (dfa) {
          _siblings = _siblings.concat(dfa._tokensByPath());
        }
      });
    }

    let hasText = false;
    let hasElements = false;
    _siblings.forEach((tagNames) => {
      // register each other as parent and children
      let _hasText = tagNames.indexOf(TEXT$2) >= 0;
      let _hasElements = (!_hasText && tagNames.length > 0);
      if (_hasText) {
        hasText = true;
      }
      if (_hasElements) {
        hasElements = true;
      }
      tagNames.forEach((tagName) => {
        const childSchema = elementSchemas[tagName];
        if (!childSchema) return
        childSchema.parents[name] = true;
        elementSchema.children[tagName] = true;
        // Note: we store siblings, grouped by parent
        elementSchema.siblings[name] = tagNames;
        if (_hasElements) childSchema.usedStructuredBy[name] = true;
        if (_hasText) childSchema.usedInlineBy[name] = true;
      });
    });
    // TODO: document what these fields are used for.
    if (hasElements) elementSchema.isStructured = true;
    if (hasText) elementSchema.isText = true;
    if (!elementSchema.type) {
      if (hasText) {
        elementSchema.type = 'text';
      } else {
        elementSchema.type = 'element';
      }
    }
  }

  class ElementSchema {
    constructor (name, type, attributes, expr) {
      this.name = name;
      this.type = type;
      this.attributes = attributes;
      this.expr = expr;
    }
  }

  function _isTextNodeEmpty (el) {
    return Boolean(/^\s*$/.exec(el.textContent))
  }

  function _validateElement (elementSchema, el) {
    let errors = [];
    let valid = true;
    if (!elementSchema) {
      return {
        errors: [ {
          msg: `Unknown tag <${el.tagName}>.`,
          el
        } ],
        ok: false
      }
    }
    // Elements
    if (elementSchema.type === 'external' || elementSchema.type === 'not-implemented') ; else {
      let res = _checkChildren(elementSchema, el);
      if (!res.ok) {
        errors = errors.concat(res.errors);
        valid = false;
      }
    }
    return {
      errors,
      ok: valid
    }
  }

  function _checkChildren (elementSchema, el) {
    // Don't validate external nodes
    if (elementSchema.type === 'external' || elementSchema.type === 'not-implemented') {
      return true
    }
    const isText = elementSchema.type === 'text';
    const expr = elementSchema.expr;
    const state = expr.getInitialState();
    const iterator = el.getChildNodeIterator();
    let valid = true;
    let tokenCount = 0;
    while (valid && iterator.hasNext()) {
      const childEl = iterator.next();
      let token;
      if (childEl.isTextNode()) {
        // Note: skipping empty text being child node of elements
        if (_isTextNodeEmpty(childEl)) {
          continue
        } else {
          token = DFA.TEXT;
        }
      } else if (childEl.isElementNode()) {
        token = childEl.tagName;
      } else if (childEl.getNodeType() === 'cdata') {
        // CDATA elements are treated as a TEXT fragment
        token = DFA.TEXT;
      } else {
        continue
      }
      tokenCount++;
      if (!expr.consume(state, token)) {
        valid = false;
      }
    }
    // add the element to the errors
    if (state.errors.length > 0) {
      state.errors.forEach((err) => {
        err.el = el;
      });
    }
    const isFinished = expr.isFinished(state);
    if (valid && !isFinished) {
      if (isText && tokenCount === 0) ; else {
        state.errors.push({
          msg: `<${el.tagName}> is incomplete.\nSchema: ${expr.toString()}`,
          el
        });
        valid = false;
      }
    }
    if (valid) {
      state.ok = true;
    }
    return state
  }

  class XMLSchema {
    constructor (elementSchemas, startElement, publicId, dtd) {
      if (!elementSchemas[startElement]) {
        throw new Error('startElement must be a valid element.')
      }
      this._elementSchemas = {};
      this.startElement = startElement;
      this.publicId = publicId;
      this.dtd = dtd;
      // wrap schemas into ElementSchemas
      substance__default.forEach(elementSchemas, (spec, name) => {
        this._elementSchemas[name] = new ElementSchema(spec.name, spec.type, spec.attributes, spec.expr);
      });
    }

    getIdAttribute () {
      return 'id'
    }

    getTagNames () {
      return Object.keys(this._elementSchemas)
    }

    getDocTypeParams () {
      return [this.startElement, this.publicId, this.dtd]
    }

    getElementSchema (name) {
      return this._elementSchemas[name]
    }

    getStartElement () {
      return this.startElement
    }

    validateElement (el) {
      let tagName = el.tagName;
      let elementSchema = this.getElementSchema(tagName);
      return _validateElement(elementSchema, el)
    }
  }

  /**
   * Look up a RNG file from the current directory or a list of search directories.
   *
   * @param {*} fs
   * @param {*} rngFileName
   * @param {*} currentDir
   * @param {*} searchDirs
   */
  function _lookupRNG (fs, rngFileName, currentDir, searchDirs) {
    let rngPath;
    // 1. Try if the file can be found directly
    rngPath = rngFileName;
    if (fs.existsSync(rngPath)) {
      return rngPath
    }
    // 2. Try the current directory
    rngPath = currentDir + '/' + rngFileName;
    if (fs.existsSync(rngPath)) {
      return rngPath
    }
    // 3. Try the search directories
    for (let i = 0; i < searchDirs.length; i++) {
      rngPath = searchDirs[i] + '/' + rngFileName;
      if (fs.existsSync(rngPath)) {
        return rngPath
      }
    }
  }

  function _expandIncludes (fs, path, currentDir, searchDirs, grammarEl) {
    let includes = grammarEl.findAll('include');
    if (includes.length === 0) return false
    includes.forEach(include => {
      const parent = include.parentNode;
      const href = include.attr('href');
      const rngPath = _lookupRNG(fs, href, currentDir, searchDirs);
      if (!rngPath) throw new Error(`Could not find ${href}`)
      const rngStr = fs.readFileSync(rngPath, 'utf8');
      const rng = substance__default.DefaultDOMElement.parseXML(rngStr, 'full-doc');
      const _grammarEl = rng.find('grammar');
      if (!_grammarEl) throw new Error('No grammar element found')
      let rngDir = path.dirname(rngPath);
      // expand the grammar recursively
      _expandIncludes(fs, path, rngDir, searchDirs, _grammarEl);
      // now replace the include element with the content of the expanded grammar
      _grammarEl.children.forEach((child) => {
        parent.insertBefore(child, include);
      });
      include.remove();
    });
    return true
  }

  /*
    Loads a RNG with all dependencies into a DOM element
  */
  function _loadRNG (fs, path, rngFile, searchDirs) {
    if (!substance__default.isArray(searchDirs)) searchDirs = [searchDirs];
    let rngDir = path.dirname(rngFile);
    let rngStr = fs.readFileSync(rngFile, 'utf8');
    const rng = substance__default.DefaultDOMElement.parseXML(rngStr, 'full-doc');
    const grammarEl = rng.find('grammar');
    _expandIncludes(fs, path, rngDir, searchDirs, grammarEl);
    return rng
  }

  // import prettyPrintXML from './prettyPrintXML'

  const TEXT$3 = DFA.TEXT;

  /*
    We use regular RNG, with slight restrictions plus custom extensions,
    and compile it into our internal format.
  */
  function _compileRNG (fs, path, rngFile, searchDirs) {
    let rng = _loadRNG(fs, path, rngFile, searchDirs);
    let grammar = rng.find('grammar');
    if (!grammar) throw new Error('<grammar> not found.')
    // collect all definitions, allowing for custom overrides
    _registerDefinitions(grammar);
    // turn the RNG schema into our internal data structure
    let transformedGrammar = _transformRNG(grammar);
    // console.log(prettyPrintXML(transformedGrammar))
    let xmlSchema = _compile(transformedGrammar);
    return xmlSchema
  }

  /* Registration of <define> elements */

  function _registerDefinitions (grammar) {
    let defs = {};
    // NOTE: definitions are only considered on the top level
    grammar.children.forEach(child => {
      const tagName = substance__default.nameWithoutNS(child.tagName);
      if (tagName === 'define') {
        _processDefine(child, defs);
      }
    });
    grammar.defs = defs;
  }

  function _processDefine (el, defs) {
    const name = el.attr('name');
    const combine = el.attr('combine');
    if (combine === 'interleave') {
      if (defs[name]) {
        defs[name].append(el.children);
      } else {
        defs[name] = el;
      }
    } else {
      if (defs[name]) ;
      defs[name] = el;
    }
  }

  /* Transformation of RNG into internal representation */
  function _transformRNG (grammar) {
    const $$ = grammar.createElement.bind(grammar);
    // remove everything elements from the grammar that have been tagged as 's:removed'
    grammar.findAll('removed').forEach(el => {
      let name = el.attr('name');
      grammar.findAll(`element[name="${name}"]`).forEach(el => {
        // console.log('removing <element>', name)
        el.remove();
      });
      grammar.findAll(`ref[name="${name}"]`).forEach(el => {
        // console.log('removing <ref>', name)
        el.remove();
      });
    });

    const elements = {};
    const defs = grammar.defs;
    const elementDefinitions = grammar.findAll('define > element');
    const doc = substance__default.DefaultDOMElement.createDocument('xml');
    const newGrammar = doc.createElement('grammar');

    // record all not implemented ones
    // we will allow to use them, but skip their content definition
    const notImplemented = grammar.findAll('not-implemented').reduce((s, el) => {
      let name = el.attr('name');
      if (name) s.add(name);
      return s
    }, new Set());

    // expand definitions
    elementDefinitions.forEach(el => {
      const name = el.attr('name');
      if (!name) throw new Error("'name' is mandatory.")
      let transformed;
      if (notImplemented.has(name)) {
        transformed = $$('element').attr('name', name).attr('type', 'not-implemented');
      } else {
        transformed = _transformElementDefinition(doc, name, el, defs);
      }
      elements[name] = transformed;
      newGrammar.appendChild(transformed);
    });

    // infer element types
    // TODO: do we need this anymore?
    const elementTypes = grammar.findAll('elementType');
    elementTypes.forEach(typeEl => {
      const name = typeEl.attr('name');
      let type = typeEl.attr('s:type') || typeEl.attr('type');
      if (!name || !type) throw new Error('Attributes name and type are mandatory.')
      const element = elements[name];
      if (!element) throw new Error(`Unknown element ${name}.`)
      element.attr('type', type);
    });

    // start element
    const startElement = _extractStart(grammar);
    if (!startElement) throw new Error('<start> is mandatory.')
    newGrammar.appendChild(doc.createElement('start').attr('name', startElement));

    return newGrammar
  }

  function _transformElementDefinition (doc, name, orig, defs) {
    let el = doc.createElement('element').attr('name', name);
    // TODO: try to separate attributes from children
    // now go through all children and wrap them into attributes and children
    let attributes = doc.createElement('attributes');
    let children = doc.createElement('children');
    orig.children.forEach((child) => {
      let block = _transformBlock(doc, child, defs, {});
      block.forEach((el) => {
        if (el.find('attribute') || el.is('attribute')) {
          attributes.appendChild(el);
        } else {
          children.appendChild(el);
        }
      });
    });
    el.appendChild(attributes);
    el.appendChild(children);

    /*
      Pruning (this is probably very slow!)
      - choice > choice
      - choice with one element
    */
    while (true) {
      // Unwrap nested choices
      let nestedChoice = children.find('choice > choice');
      if (nestedChoice) {
        // unwrap onto parent level
        let parentChoice = nestedChoice.parentNode;
        // TODO: we could use DOM helpers as we do in Texture converters
        let children = nestedChoice.children;
        children.forEach((child) => {
          parentChoice.insertBefore(child, nestedChoice);
        });
        parentChoice.removeChild(nestedChoice);
        continue
      }
      break
    }

    // Simplify singular choices
    let choices = children.findAll('choice');
    for (let i = 0; i < choices.length; i++) {
      let choice = choices[i];
      let children = choice.children;
      if (children.length === 1) {
        choice.parentNode.replaceChild(choice, children[0]);
      }
    }

    let optionalTextEls = children.findAll('optional > text, zeroOrMore > text');
    for (let i = 0; i < optionalTextEls.length; i++) {
      let textEl = optionalTextEls[i];
      let optionalEl = textEl.parentNode;
      if (optionalEl.getChildCount() === 1) {
        optionalEl.parentNode.replaceChild(optionalEl, textEl);
      }
    }

    // remove empty groups
    let groupEls = children.findAll('optional, zeroOrMore, oneOrMore');
    for (let i = 0; i < groupEls.length; i++) {
      let groupEl = groupEls[i];
      if (groupEl.getChildCount() === 0) {
        groupEl.remove();
      }
    }

    return el
  }

  function _transformBlock (doc, block, defs, visiting = {}) {
    // if a block is a <ref> return the expanded children
    // otherwise clone the block and descend recursively
    const tagName = block.tagName;
    switch (tagName) {
      case 'element': {
        return [doc.createElement('element').attr('name', block.attr('name'))]
      }
      case 'ref': {
        return _expandRef(doc, block, defs, visiting)
      }
      case 'empty':
      case 'notAllowed': {
        return []
      }
      default: {
        // TODO: while this is a valid approach, it could be more efficient
        // to 'reuse' already processed elements (i.e. reuse their DFA)
        // For that reason, I have commented out all occurrences where I used to resuse the DFA
        // being dead code at the moment
        let clone = block.clone(false);
        block.children.forEach((child) => {
          clone.append(_transformBlock(doc, child, defs, visiting));
        });
        return [clone]
      }
    }
  }

  function _expandRef (doc, ref, defs, visiting = {}) {
    const name = ref.attr('name');
    // Acquire semaphore against cyclic refs
    if (visiting[name]) {
      throw new Error('Cyclic references are not supported.')
    }
    visiting[name] = true;

    const def = defs[name];
    if (!def) throw new Error(`Unknown definition ${name}`)

    let expanded = [];
    let children = def.children;
    children.forEach((child) => {
      let transformed = _transformBlock(doc, child, defs, visiting);
      expanded = expanded.concat(transformed);
    });

    // Releasing semaphore against cyclic refs
    delete visiting[name];
    return expanded
  }

  function _extractStart (grammar) {
    // for now this is hard wired to work with the start
    // element as defined in JATS 1.1
    const start = grammar.find('start');
    if (!start) {
      throw new Error('<grammar> must have a <start> element')
    }
    // HACK: we assume that there is exactly one ref to
    // an element definition
    const startRef = start.find('ref');
    if (!startRef) {
      throw new Error('Expecting one <ref> inside of <start>.')
    }
    const name = startRef.attr('name');
    return name
  }

  function _compile (grammar) {
    const schemas = {};
    const elements = grammar.children.filter(el => el.tagName === 'element');
    elements.forEach(element => {
      const name = element.attr('name');
      const attributes = _collectAttributes(element.find('attributes'));
      const children = element.find('children');
      const type = element.attr('type');
      let block = _processChildren(children, grammar);
      let expr = createExpression(name, block);
      let schema = { name, type, attributes, expr };
      schemas[name] = schema;
    });

    // this adds some reflection info and derives the type
    analyze(schemas);

    const start = grammar.find('start');
    if (!start) {
      throw new Error('<start> is mandatory')
    }
    const startElement = start.attr('name');
    if (!startElement) {
      throw new Error('<start> must have "name" set')
    }
    return new XMLSchema(schemas, startElement)
  }

  function _processChildren (el, grammar) {
    if (!el) return new Sequence([])
    let blocks = _processBlocks(el.children, grammar);
    if (blocks.length === 1) {
      return blocks[0]
    } else {
      return new Sequence(blocks)
    }
  }

  function _processBlocks (children, grammar) {
    const blocks = [];
    for (var i = 0; i < children.length; i++) {
      const child = children[i];
      // const name = child.attr('name')
      switch (child.tagName) {
        // skip these
        case 'attribute':
        case 'empty':
        case 'notAllowed': {
          break
        }
        case 'element': {
          const elName = child.attr('name');
          blocks.push(new Token(elName));
          break
        }
        case 'text': {
          blocks.push(new Token(TEXT$3));
          break
        }
        case 'ref': {
          const block = _processReference(child, grammar);
          blocks.push(block);
          break
        }
        case 'group': {
          blocks.push(_processSequence(child, grammar));
          break
        }
        case 'choice': {
          const block = _processChoice(child, grammar);
          blocks.push(block);
          break
        }
        case 'optional': {
          const block = new Optional(_processChildren(child, grammar));
          blocks.push(block);
          break
        }
        case 'oneOrMore': {
          const block = new Plus(_processChildren(child, grammar));
          blocks.push(block);
          break
        }
        case 'zeroOrMore': {
          const block = new Kleene(_processChildren(child, grammar));
          blocks.push(block);
          break
        }
        case 'interleave': {
          const block = new Interleave(_processBlocks(child.children, grammar));
          blocks.push(block);
          break
        }
        default:
          throw new Error('Not supported yet: ' + child.tagName)
      }
    }
    return blocks
  }

  function _processSequence (el, grammar) {
    // TODO: seems that this optimization is not needed any more as references get inlined.
    // looking at _expandRef() it looks as though the corresponding DOMElement gets cloned on recursion
    // see above
    // if (el.expr) return el.expr.copy()
    const blocks = _processBlocks(el.children, grammar);
    el.expr = new Sequence(blocks);
    return el.expr
  }

  function _processChoice (el, grammar) {
    // if (el.expr) return el.expr.copy()
    let blocks = _processBlocks(el.children, grammar);
    el.expr = new Choice(blocks);
    return el.expr
  }

  function _processReference (ref, grammar) {
    const name = ref.attr('name');
    const def = grammar.defs[name];
    if (!def) throw new Error(`Illegal ref: ${name} is not defined.`)
    // if (def.expr) return def.expr.copy()
    // Guard for cyclic references
    // TODO: what to do with cyclic refs?
    if (grammar._visiting[name]) {
      throw new Error('Cyclic references are not supported yet')
    }
    grammar._visiting[name] = true;
    const block = _processChildren(def, grammar);
    def.expr = block;
    delete grammar._visiting[name];
    return def.expr
  }

  function _collectAttributes (el, grammar, attributes = {}) {
    if (!el) return {}
    // ATTENTION: RNG supports more than we do here
    // We just collect all attributes, infering no rules
    let children = el.children;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      switch (child.tagName) {
        case 'attribute': {
          const attr = _transformAttribute(child);
          attributes[attr.name] = attr;
          break
        }
        case 'group':
        case 'choice':
        case 'optional':
        case 'oneOrMore':
        case 'zeroOrMore': {
          _collectAttributes(child, grammar, attributes);
          break
        }
        default:
          //
      }
    }
    return attributes
  }

  function _transformAttribute (el) {
    const name = el.attr('name');
    // TODO: extract all the attribute specs
    return {
      name
    }
  }

  function validateXML (xmlSchema, dom) {
    let root = dom.find(xmlSchema.getStartElement());
    if (!root) {
      return {
        errors: [{
          msg: 'Start element is missing.',
          el: dom
        }]
      }
    } else {
      return validateElement(xmlSchema, root)
    }
  }

  function validateElement (xmlSchema, el) {
    let errors = [];
    let valid = true;
    let q = [el];
    while (q.length > 0) {
      let next = q.shift();
      let res = xmlSchema.validateElement(next);
      if (!res.ok) {
        errors = errors.concat(res.errors);
        valid = false;
      }
      if (next.isElementNode()) {
        q = q.concat(next.getChildren());
      }
    }
    return {
      errors: errors,
      ok: valid
    }
  }

  /**
   * This implementation is creating a minified representation of a Schema.
   *
   * ```
   * [ [<string-literals...>], <rootElId>, [<elements...>] ]
   *
   * element: [ <nameId>, [<attributes...>], <content> ]
   * attribute: <nameId> (temporarily)
   * content: [<type>:'*?+si', []|<nameId> ]
   * ```
   */

  class LiteralRegistry {
    constructor () {
      this._map = new Map();
    }

    register (literal) {
      if (!this._map.has(literal)) {
        this._map.set(literal, { literal, count: 0 });
      }
      this._map.get(literal).count++;
    }

    computeRanks () {
      let entries = Array.from(this._map.values());
      entries.sort((a, b) => {
        return b.count - a.count
      });
      let L = entries.length;
      for (let idx = 0; idx < L; idx++) {
        entries[idx].rank = idx;
      }
      this._sortedLiterals = entries.map(e => e.literal);
    }

    getRank (literal) {
      return this._map.get(literal).rank
    }

    getSortedLiterals () {
      return this._sortedLiterals
    }
  }

  function serializeXMLSchema (xmlSchema) {
    let literalRegistry = new LiteralRegistry();

    function _registerLiterals (o) {
      switch (o.constructor) {
        case XMLSchema: {
          literalRegistry.register(o.startElement);
          o.getTagNames().forEach(name => {
            _registerLiterals(o.getElementSchema(name));
          });
          break
        }
        case ElementSchema: {
          literalRegistry.register(o.name);
          Object.keys(o.attributes).forEach(attrName => {
            // TODO: later we should also register attribute values
            literalRegistry.register(attrName);
          });
          _registerLiterals(o.expr);
          break
        }
        case DFAExpr:
        case InterleaveExpr: {
          _registerLiterals(o.root);
          break
        }
        case Token: {
          literalRegistry.register(o.name);
          break
        }
        case Choice:
        case Sequence:
        case Interleave: {
          o.blocks.forEach(_registerLiterals);
          break
        }
        case Optional:
        case Kleene:
        case Plus: {
          _registerLiterals(o.block);
          break
        }
        default:
          throw new Error('FIXME')
      }
    }
    _registerLiterals(xmlSchema);

    literalRegistry.computeRanks();

    function _encode (o) {
      switch (o.constructor) {
        case XMLSchema: {
          return [
            literalRegistry.getRank(o.startElement),
            o.getTagNames().map(name => {
              return _encode(o.getElementSchema(name))
            })
          ]
        }
        case ElementSchema: {
          return [
            literalRegistry.getRank(o.name),
            o.type === 'text' ? 't' : 'e',
            Object.keys(o.attributes).map(attrName => {
              // TODO: later we should also register attribute values
              return literalRegistry.getRank(attrName)
            }),
            _encode(o.expr)
          ]
        }
        case DFAExpr:
        case InterleaveExpr: {
          return _encode(o.root)
        }
        case Token: {
          return literalRegistry.getRank(o.name)
        }
        case Choice:
        case Sequence:
        case Interleave: {
          return [
            o.token,
            o.blocks.map(_encode)
          ]
        }
        case Optional:
        case Kleene:
        case Plus: {
          return [
            o.token,
            _encode(o.block)
          ]
        }
      }
    }
    let data = { literals: literalRegistry.getSortedLiterals(), schema: _encode(xmlSchema) };

    return JSON.stringify(data)
  }

  function deserializeXMLSchema (xmlSchemaInput, publicId = '', dtd = '') {
    let data;
    if (substance__default.isString(xmlSchemaInput)) {
      data = JSON.parse(xmlSchemaInput);
    } else {
      data = xmlSchemaInput;
    }
    let literals = data.literals;
    let schemaData = data.schema;

    function _decodeLiteral (d) {
      return literals[d]
    }

    let startElement = _decodeLiteral(schemaData[0]);
    let elementSchemas = {};

    function _decodeExpression (d) {
      if (substance__default.isNumber(d)) {
        return new Token(_decodeLiteral(d))
      } else if (substance__default.isArray(d)) {
        let type = d[0];
        let content = d[1];
        switch (type) {
          case Sequence.token:
            return new Sequence(content.map(_decodeExpression))
          case Interleave.token:
            return new Interleave(content.map(_decodeExpression))
          case Choice.token:
            return new Choice(content.map(_decodeExpression))
          case Optional.token:
            return new Optional(_decodeExpression(content))
          case Plus.token:
            return new Plus(_decodeExpression(content))
          case Kleene.token:
            return new Kleene(_decodeExpression(content))
        }
      } else {
        throw new Error('invalid data')
      }
    }

    function _decodeElementSchemaData (d) {
      let name = _decodeLiteral(d[0]);
      let type = d[1] === 't' ? 'text' : 'element';
      // TODO: at some point we gonna have more complex attribute specs
      let attributes = {};
      d[2].forEach(rank => {
        let literal = _decodeLiteral(rank);
        attributes[literal] = literal;
      });
      let expr = createExpression(name, _decodeExpression(d[3]));
      return new ElementSchema(name, type, attributes, expr)
    }

    schemaData[1].forEach(elementSchemaData => {
      let elementSchema = _decodeElementSchemaData(elementSchemaData);
      elementSchemas[elementSchema.name] = elementSchema;
    });

    let schema = new XMLSchema(elementSchemas, startElement, publicId, dtd);
    return schema
  }

  exports._analyzeSchema = analyze;
  exports._compileRNG = _compileRNG;
  exports._expandIncludes = _expandIncludes;
  exports._isTextNodeEmpty = _isTextNodeEmpty;
  exports._loadRNG = _loadRNG;
  exports._lookupRNG = _lookupRNG;
  exports.DFA = DFA;
  exports.DFABuilder = DFABuilder;
  exports.validateXML = validateXML;
  exports.XMLSchema = XMLSchema;
  exports.serializeXMLSchema = serializeXMLSchema;
  exports.deserializeXMLSchema = deserializeXMLSchema;


  });

  unwrapExports(textureXmlUtils_cjs);
  var textureXmlUtils_cjs_1 = textureXmlUtils_cjs._analyzeSchema;
  var textureXmlUtils_cjs_2 = textureXmlUtils_cjs._compileRNG;
  var textureXmlUtils_cjs_3 = textureXmlUtils_cjs._expandIncludes;
  var textureXmlUtils_cjs_4 = textureXmlUtils_cjs._isTextNodeEmpty;
  var textureXmlUtils_cjs_5 = textureXmlUtils_cjs._loadRNG;
  var textureXmlUtils_cjs_6 = textureXmlUtils_cjs._lookupRNG;
  var textureXmlUtils_cjs_7 = textureXmlUtils_cjs.DFA;
  var textureXmlUtils_cjs_8 = textureXmlUtils_cjs.DFABuilder;
  var textureXmlUtils_cjs_9 = textureXmlUtils_cjs.validateXML;
  var textureXmlUtils_cjs_10 = textureXmlUtils_cjs.XMLSchema;
  var textureXmlUtils_cjs_11 = textureXmlUtils_cjs.serializeXMLSchema;
  var textureXmlUtils_cjs_12 = textureXmlUtils_cjs.deserializeXMLSchema;

  class ArticleConfigurator extends TextureConfigurator {
    constructor (parent, name) {
      super(parent, name);

      this._xmlSchemaIds = new Set();
      this._xmlValidators = new Map();
      this._xmlTransformations = new Map();
    }

    registerSchemaId (xmlSchemaId) {
      this._xmlSchemaIds.add(xmlSchemaId);
    }

    isSchemaKnown (xmlSchemaId) {
      return this._xmlSchemaIds.has(xmlSchemaId)
    }

    addValidator (xmlSchemaId, validator) {
      this._xmlValidators.set(xmlSchemaId, validator);
    }

    getValidator (xmlSchemaId) {
      return this._xmlValidators.get(xmlSchemaId)
    }

    addTransformation (xmlSchemaId, transformation) {
      this._xmlTransformations.set(xmlSchemaId, transformation);
    }

    getTransformation (xmlSchemaId) {
      return this._xmlTransformations.get(xmlSchemaId)
    }
  }

  class ArticleLoader {
    /**
     * The ArticleLoader by default takes a JATS file and importing it into
     * Texture's internal article model. On the way to there, the source file
     * is first validated against the declared schema. Then a set of transformations
     * is applied open to some known tagging habbits deviating from the tagging style
     * adopted by Texture. Before applying the actual mapping into the internal
     * article model, the content is validated against the TextureJATS schema,
     * being a subset of JATS, as an indicator for problems such as loss of information.
     */
    load (xml, config) {
      let articleConfig = config.getConfiguration('article');

      let xmlDom = substance.DefaultDOMElement.parseXML(xml);

      let xmlSchemaId = xmlDom.getDoctype().publicId;
      // TODO: we need some kind of schema id normalisation, as it seems that
      // in real-world JATS files, nobody is
      if (!xmlSchemaId) {
        throw new Error(`No XML schema specified.`)
      } else if (!articleConfig.isSchemaKnown(xmlSchemaId)) {
        throw new Error(`Unsupported xml schema: ${xmlSchemaId}`)
      }

      // optional input validation if registered
      let validator = articleConfig.getValidator(xmlSchemaId);
      if (validator) {
        let validationResult = validator.validate(xmlDom);
        if (!validationResult.ok) {
          let err = new Error('Validation failed.');
          err.detail = validationResult.errors;
          //TODO wit throw err
        }
      }

      // NOTE: there is only one transformation step, i.e. a migration would need
      // to apply other steps implicitly
      let transformation = articleConfig.getTransformation(xmlSchemaId);
      if (transformation) {
        xmlDom = transformation.import(xmlDom);
        // transformation should have updated the schema
        xmlSchemaId = xmlDom.getDoctype().publicId;
        // optional another validation step for the new schema
        let validator = articleConfig.getValidator(xmlSchemaId);
        if (validator) {
          let validationResult = validator.validate(xmlDom);
          if (!validationResult.ok) {
            let err = new Error('Validation failed.');
            err.detail = validationResult.errors;
            //TODO wit throw err
          }
        }
      }

      // TODO: we should only use nodes that are registered for the specifc schema
      let schema = new substance.DocumentSchema({
        DocumentClass: InternalArticleDocument,
        nodes: articleConfig.getNodes(),
        // TODO: try to get rid of this by using property schema
        defaultTextType: 'paragraph'
      });
      let doc = InternalArticleDocument.createEmptyArticle(schema);

      let importer = articleConfig.createImporter(xmlSchemaId, doc);
      if (!importer) {
        console.error(`No importer registered for "${xmlSchemaId}". Falling back to default JATS importer, but with unpredictable result.`);
        // Falling back to default importer
        importer = articleConfig.createImporter('jats', doc);
      }
      importer.import(xmlDom);
      // EXPERIMENTAL: storing the xmlSchemaId on the doc, so that
      // it can be exported using the correct transformers and exporters
      doc.docType = xmlSchemaId;

      return doc
    }
  }

  // class ImporterErrorReport {
  //   constructor (jatsImporterErrors) {
  //     let failedStages = []
  //     forEach(jatsImporterErrors, (errors, stage) => {
  //       if (errors && errors.length > 0) {
  //         failedStages.push({ name: stage, errors })
  //       }
  //     })
  //     this._errors = failedStages
  //   }

  //   toString () {
  //     let frags = this._errors.reduce((frags, stage) => {
  //       frags.push(`Errors during stage ${stage.name}:`)
  //       frags = frags.concat(stage.errors.map(err => {
  //         return _indentMsg(err.msg, '  ') + '\n'
  //       }))
  //       return frags
  //     }, [])
  //     return frags.join('\n')
  //   }
  // }

  // function _indentMsg (msg, indent) {
  //   return msg.split('\n').map(line => indent + line).join('\n')
  // }

  var ArticleModelPackage = {
    name: 'article.model',
    configure (config) {
  [
        Abstract, Article, ArticleRef,
        BlockFormula, BlockQuote, Body, Bold, BookRef, Break, ChapterRef, ConferencePaperRef,
        CustomAbstract, MetadataField, DataPublicationRef, ExternalLink, Figure, FigurePanel,
        Footnote, Funder, Graphic, Group, Heading, InlineFormula, InlineGraphic, Italic,
        Keyword, JournalArticleRef, List, ListItem, MagazineArticleRef, Metadata, Monoscript,
        NewspaperArticleRef, Affiliation, Overline, Paragraph, PatentRef, Permission,
        Person, Preformat, RefContrib, Reference, ReportRef, SmallCaps, SoftwareRef,
        StrikeThrough, Subject, Subscript, Superscript, SupplementaryFile, Table, TableCell,
        TableFigure, TableRow, ThesisRef, Underline, WebpageRef, Xref
      ].forEach(node => config.addNode(node));
      // additionally register nodes that are used to wrap unsupported XML elements
      config.addNode(UnsupportedNode);
      config.addNode(UnsupportedInlineNode);
    }
  };

  var DefaultSettings = {
    'article-ref.authors': { required: true },
    'article-ref.containerTitle': { required: true },
    'article-ref.title': { required: true },
    'book-ref.authors': { required: true },
    'book-ref.title': { required: true },
    'chapter-ref.authors': { required: true },
    'chapter-ref.containerTitle': { required: true },
    'chapter-ref.title': { required: true },
    'conference-paper-ref.authors': { required: true },
    'conference-paper-ref.title': { required: true },
    'custom-abstract.abstractType': { required: true },
    'custom-abstract.content': { required: true },
    'data-publication-ref.authors': { required: true },
    'data-publication-ref.containerTitle': { required: true },
    'data-publication-ref.title': { required: true },
    'figure-panel.title': { required: true },
    'funder.institution': { required: true },
    'group.name': { required: true },
    'journal-article-ref.authors': { required: true },
    'journal-article-ref.containerTitle': { required: true },
    'journal-article-ref.title': { required: true },
    'keyword.name': { required: true },
    'magazine-article-ref.authors': { required: true },
    'magazine-article-ref.containerTitle': { required: true },
    'magazine-article-ref.title': { required: true },
    'newspaper-article-ref.authors': { required: true },
    'newspaper-article-ref.containerTitle': { required: true },
    'newspaper-article-ref.title': { required: true },
    'affiliation.institution': { required: true },
    'patent-ref.containerTitle': { required: true },
    'patent-ref.inventors': { required: true },
    'patent-ref.title': { required: true },
    'person.givenNames': { required: true },
    'person.surname': { required: true },
    'ref-contrib.givenNames': { required: true },
    'ref-contrib.name': { required: true },
    'report-ref.authors': { required: true },
    'report-ref.title': { required: true },
    'software-ref.authors': { required: true },
    'software-ref.title': { required: true },
    'subject.name': { required: true },
    'thesis-ref.authors': { required: true },
    'thesis-ref.title': { required: true },
    'thesis-ref.year': { required: true },
    'webpage-ref.authors': { required: true },
    'webpage-ref.containerTitle': { required: true },
    'webpage-ref.title': { required: true }
  };

  const EMPTY = Object.freeze({});

  // ATTENTION: this is a prototype implementation and will be redesigned when the requirements clear.
  class ExperimentalEditorSettings {
    constructor () {
      this._settings = new substance.TreeIndex();
    }

    // getConfiguration (xpath) {
    //   // ATTENTION: for the moment only non-hierarchical selectors
    //   let current = last(xpath)
    //   let config = this._settings
    //   let nodeConfig = config[current.type]
    //   let result = EMPTY
    //   if (nodeConfig) {
    //     let propConfig = nodeConfig[current.property]
    //     if (propConfig) {
    //       result = propConfig
    //     }
    //   }
    //   return result
    // }

    getSettingsForValue (path) {
      return this._settings.get(path) || EMPTY
    }

    load (settings) {
      this._settings.clear();
      this.extend(settings);
    }

    extend (settings) {
      let selectors = Object.keys(settings);
      for (let selector of selectors) {
        this._extendValueSettings(selector, settings[selector]);
      }
    }

    _extendValueSettings (selector, spec) {
      if (selector.indexOf('<') !== -1) throw new Error('hierarchical selectors not supported yet')
      let path = selector.trim().split('.');
      let valueSettings = this._settings.get(path);
      if (!valueSettings) {
        valueSettings = {};
        this._settings.set(path, valueSettings);
      }
      Object.assign(valueSettings, spec);
    }
  }

  var FigurePackageSettings = {};

  class ArticlePanel extends substance.Component {
    constructor (...args) {
      super(...args);

      // TODO: should we really (ab-)use the regular Component state as AppState?
      this._initialize(this.props, this.state);
    }

    getActionHandlers () {
      return {
        executeCommand: this._executeCommand,
        toggleOverlay: this._toggleOverlay,
        startWorkflow: this._startWorkflow,
        closeModal: this._closeModal,
        scrollElementIntoView: this._scrollElementIntoView,
        scrollTo: this._scrollTo,
        updateRoute: this._updateRoute
      }
    }

    _initialize (props) {
      // TODO: I want to move to a single-layer setup for all views in this panel,
      // i.e. no extra configurations and if possible no extra editor session
      // and instead contextualize commands tools etc.
      const { archive, config, document } = props;
      const doc = document;

      let editorSession = new ArticleEditorSession('article', doc, config, {
        workflowId: null,
        workflowProps: null,
        overlayId: null,
        settings: this._createSettings(doc)
      });
      this.editorSession = editorSession;

      let appState = editorSession.editorState;
      this.appState = appState;

      let api = new ArticleAPI(editorSession, archive, config);
      this.api = api;

      let context = Object.assign(this.context, substance.createComponentContext(config), {
        config,
        editorSession,
        editorState: appState,
        api,
        archive,
        urlResolver: archive,
        editor: this
      });
      this.context = context;

      editorSession.setContext(context);
      editorSession.initialize();

      appState.addObserver(['workflowId'], this.rerender, this, { stage: 'render' });
      appState.addObserver(['settings'], this._onSettingsUpdate, this, { stage: 'render' });
      // HACK: ATM there is no better way than to listen to an archive
      // event and forcing the CommandManager to update commandStates
      // and propagating the changes
      archive.on('archive:saved', () => {
        // HACK: setting the selection dirty, also makes sure the DOM selection gets rerendered
        // as opposed to triggering the commandManager directly
        appState._setDirty('selection');
        appState.propagateUpdates();
      });
      // HACK: resetting the app state here, because things might get 'dirty' during initialization
      // TODO: find out if there is a better way to do this
      appState._reset();
    }

    willReceiveProps (props) {
      if (props.document !== this.props.document) {
        this._initialize(props);
        this.empty();
      }
    }

    getContext () {
      return this.context
    }

    getContentPanel () {
      // This is part of the Editor interface
      // ATTENTION: being a legacy of the multi-view implementation
      // this has to provide the content panel of the content panel
      return this.refs.content.getContentPanel()
    }

    didMount () {
      let router = this.context.router;
      if (router) {
        this._onRouteChange(router.readRoute());
        router.on('route:changed', this._onRouteChange, this);
      }
    }

    dispose () {
      let router = this.context.router;
      if (router) {
        router.off(this);
      }
    }

    shouldRerender (newProps, newState) {
      return (
        newProps.document !== this.props.document ||
        newProps.config !== this.props.config ||
        newState !== this.state
      )
    }

    render ($$) {
      let el = $$('div').addClass('sc-article-panel');
      el.append(
        this._renderContent($$)
      );
      return el
    }

    _renderContent ($$) {
      const props = this.props;
      const api = this.api;
      const archive = props.archive;
      const editorSession = this.editorSession;
      const config = props.config;

      let ContentComponent = this.getComponent('article-editor');
      return $$(ContentComponent, {
        api,
        archive,
        editorSession,
        config,
        editorState: editorSession.editorState
      }).ref('content')
    }

    _closeModal () {
      const appState = this._getAppState();
      let workflowId = appState.workflowId;
      if (workflowId) {
        this._clearRoute();
      }
      appState.workflowId = null;
      appState.overlayId = null;
      appState.propagateUpdates();
    }

    _createAppState (config) { // eslint-disable-line no-unused-vars
      return new substance.AppState()
    }

    // EXPERIMENTAL:
    // this is a first prototype for settings used to control editability and required fields
    // On the long run we need to understand better what different means of configuration we want to offer
    _createSettings (doc) {
      let settings = new ExperimentalEditorSettings();
      let metadata = doc.get('metadata');
      // Default settings
      settings.load(DefaultSettings);
      // Article type specific settings
      if (metadata.articleType === 'figure-package') {
        settings.extend(FigurePackageSettings);
      }
      return settings
    }

    _executeCommand (name, params) {
      this._getEditorSession().executeCommand(name, params);
    }

    _getAppState () {
      return this.appState
    }

    _getEditorSession () {
      return this.editorSession
    }

    _handleKeydown (e) {
      // console.log('ArticlePanel._handleKeydown', e)
      // ATTENTION: asking the currently active content to handle the keydown event first
      let handled = this.refs.content._onKeydown(e);
      // Note: if we had a keyboardManager here we could ask it to handle the event
      // if (!handled) {
      //   handled = this.context.keyboardManager.onKeydown(e, this.context)
      // }
      if (handled) {
        e.stopPropagation();
        e.preventDefault();
      }
      return handled
    }

    _scrollElementIntoView (el, force) {
      return this.refs.content._scrollElementIntoView(el, force)
    }

    _scrollTo (params) {
      return this.refs.content._scrollTo(params)
    }

    _startWorkflow (workflowId, workflowProps) {
      const appState = this._getAppState();
      if (appState.workflowId) throw new Error('Another workflow has been started already.')
      appState.workflowId = workflowId;
      appState.workflowProps = workflowProps;
      appState.overlayId = workflowId;
      appState.propagateUpdates();
      this._updateRoute({ workflow: workflowId });
    }

    _toggleOverlay (overlayId) {
      const appState = this._getAppState();
      if (appState.overlayId === overlayId) {
        appState.overlayId = null;
      } else {
        appState.overlayId = overlayId;
      }
      appState.propagateUpdates();
    }
    _onSettingsUpdate () {
      // FIXME: there is a BUG in Component.js leading to undisposed surfaces
      // HACK: instead of doing an incremental DOM update force disposal by wiping the content
      // ATTENTION: removing the following line leads to the BUG
      this.empty();
      this.rerender();
    }

    // Routing
    // =======
    // ATTENTION: routing is a questionable feature, because Texture might be embedded into an environment with
    // its own routing. We primarily use it for development. We are considering to remove it from this component
    // and instead do this just in the demo setup.
    // ATM, this is only activated when Texture is mounted with `enableRouting:true`

    _clearRoute () {
      let router = this.context.router;
      // Note: we do not change the route while running tests, otherwise the test url get's lost
      // TODO: why is the TestSuite using a router? sounds like this could be achieved with URL params at least
      if (router && !substance.platform.test) {
        router.clearRoute();
      }
    }

    _updateRoute (params) {
      let router = this.context.router;
      // Note: we do not change the route while running tests, otherwise the test url get's lost
      // TODO: why is the TestSuite using a router? sounds like this could be achieved with URL params at least
      if (router && !substance.platform.test) {
        router.writeRoute(params);
      }
    }

    _onRouteChange (data) {
      // EXPERIMENTAL: taking an object from the router
      // and interpreting it to navigate to the right location in the app
      let { workflow, section, nodeId } = data;
      let el;
      if (workflow && workflow !== this.appState.workflowId) {
        if (this.appState.workflowId) {
          this._closeModal();
        }
        this._startWorkflow(workflow);
      }
      if (nodeId) {
        // NOTE: we need to search elements only inside editor
        // since TOC contains the same attributes
        el = this.el.find(`.se-content [data-id='${nodeId}']`);
      } else if (section) {
        // NOTE: since we are using dots inside id attributes,
        // we need to be careful with a dom query
        el = this.el.find(`.se-content [data-section='${section}']`);
      }
      if (el) {
        // forcing scroll, i.e. bringing target element always to the top
        this.refs.content.send('scrollElementIntoView', el, true);
      }
    }
  }

  class ArticleSerializer {
    export (doc, config) {
      let articleConfig = config.getConfiguration('article');

      // EXPERIMENTAL: I am not sure yet, if this is the right way to use
      // exportes and transformers.
      // During import we store the original docType on the document instance
      // Now we use this to create the corresponding exporter
      let docType = doc.docType || DEFAULT_JATS_SCHEMA_ID;

      let exporter = articleConfig.createExporter(docType, doc);
      if (!exporter) {
        console.error(`No exporter registered for "${docType}". Falling back to default JATS importer, but with unpredictable result.`);
        // Falling back to default importer
        exporter = articleConfig.createExporter('jats', doc);
      }
      let res = exporter.export(doc);
      let jats = res.jats;

      let transformation = articleConfig.getTransformation(docType);
      if (transformation) {
        transformation.export(jats);
      }

      let xmlStr = substance.prettyPrintXML(jats);
      xmlStr = String(xmlStr)
           .replace(/&lt;mixed-citation/g, '<mixed-citation')
           .replace(/&lt;\/mixed-citation&gt;/g, '<\/mixed-citation>')
           .replace(/publication-type="journal"&gt;/g, 'publication-type="journal">')
          .replace(/<element-citation(\s)publication-type="(.)*">(\s)*<(.)*>(\s)*<mixed-citation\s/g, '<mixed-citation ')
          .replace(/<element-citation>(\s)*<(.)*>(\s)*<mixed-citation/g, '<mixed-citation')
          .replace(/<\/mixed-citation><\/(.)*>(\s)+<\/element-citation>/g, '<\/mixed-citation>');

      // for the purpose of debugging
      if (substance.platform.inBrowser) {
        console.info('saving jats', { el: jats.getNativeElement(), xml: xmlStr });
      }



      return xmlStr
    }
  }

  var TextureJATSData = {"literals":["id","xml:base","specific-use","xml:lang","content-type","TEXT","bold","fixed-case","italic","monospace","overline","overline-start","overline-end","roman","sans-serif","sc","strike","underline","underline-start","underline-end","ruby","sub","sup","named-content","xref","ext-link","styled-content","abbrev","milestone-end","milestone-start","inline-supplementary-material","chem-struct","inline-formula","inline-graphic","private-char","target","alternatives","break","xlink:type","xlink:href","xlink:role","xlink:title","xlink:show","xlink:actuate","p","label","style","rid","align","char","charoff","valign","toggle","list","supplementary-material","title","position","orientation","def-list","disp-formula","disp-formula-group","disp-quote","email","country","sec","fig","tr","name","string-name","collab","permissions","uri","publication-format","seq","year","month","day","iso-8601-date","calendar","ack","boxed-text","chem-struct-wrap","fig-group","caption","preformat","table-wrap","speech","statement","verse-group","contrib-group","role","article-title","aff","institution","institution-wrap","object-id","pub-id-type","issue","volume","fpage","lpage","page-range","elocation-id","version","season","era","string-date","given-names","alt","kwd-group","subj-group","fn-group","graphic","mime-subtype","mimetype","tex-math","width","col","article","ali:free_to_read","start_date","ali:license_ref","contrib","corresp","contrib-id","bio","copyright-holder","copyright-statement","copyright-year","license","license-p","price","addr-line","city","fax","phone","postal-code","state","aff-alternatives","conf-loc","conf-name","isbn","issue-title","trans-title-group","trans-title","trans-subtitle","anonymous","etal","publisher-name","publisher-loc","element-citation","chapter-title","comment","edition","person-group","pub-id","source","data-title","part-title","patent","series","date-in-citation","address","institution-id","date","date-type","collab-alternatives","symbol","name-alternatives","name-style","surname","prefix","suffix","initials","assigning-authority","attrib","alt-text","article-meta","article-id","article-categories","title-group","pub-date","history","abstract","trans-abstract","funding-group","subject","compound-subject","abstract-type","kwd","subtitle","fn","array","media","table-wrap-group","table","table-wrap-foot","arrange","award-group","award-type","funding-source","award-id","principal-award-recipient","principal-investigator","journal-meta","list-item","ref-list","ref","designator","colgroup","thead","tfoot","tbody","span","th","td","abbr","axis","headers","scope","rowspan","colspan","front","body","back","end_date","contrib-type","equal-contrib","deceased","license-type","conf-date","conf-sponsor","issn","issn-l","issue-id","issue-part","issue-sponsor","journal-id","volume-id","volume-series","volume-issue-group","on-behalf-of","publisher","size","citation-alternatives","mixed-citation","publication-type","publisher-type","institution-id-type","supplement","collab-type","contrib-id-type","authenticated","degrees","ext-link-type","def","currency","related-article","sig-block","sig","notes","long-desc","custom-meta-group","custom-meta","meta-name","meta-value","textual-form","subj-group-type","compound-subject-part","series-title","series-text","author-notes","product","self-uri","kwd-group-type","compound-kwd","compound-kwd-part","nested-kwd","unstructured-kwd-group","pub-type","conference","conf-acronym","conf-num","conf-theme","string-conf","counts","count","equation-count","fig-count","table-count","ref-count","page-count","word-count","alt-title","author-comment","app-group","app","glossary","fig-type","baseline-shift","preformat-type","xml:space","hr","underline-style","rb","rt","rp","funding-statement","open-access","source-type","journal-title-group","journal-title","journal-subtitle","abbrev-journal-title","fn-type","ref-type","term-head","def-head","def-item","term","list-type","prefix-word","list-content","continued-from","notation","speaker","verse-line","note","annotation","gov","person-group-type","std","std-organization","trans-source","related-object","floats-group","sec-type","disp-level","sec-meta","summary","border","frame","rules","cellspacing","cellpadding","glyph-data","glyph-ref","article-type","dtd-version","sub-article","front-stub","response"],"schema":[118,[[119,"e",[0,1,4,2,225,120],[",",[]]],[121,"t",[0,1,4,2,120],5],[89,"e",[0,1,4,2],["*",122]],[122,"e",[0,1,226,123,227,228,47,2,38,39,40,41,42,43],["~",[["*",124],["?",67],["?",62],["?",68],["?",125],["?",69],["?",90],["*",24]]]],[126,"t",[0,1,4,2,3],5],[127,"t",[0,1,4,2,3],5],[128,"t",[0,1,4,2],5],[129,"e",[0,1,229,2,3,38,39,40,41,42,43],["~",[["?",121],["?",130]]]],[130,"t",[0,1,4,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,31,32,33,34,27,28,29,23,26,35,24,21,22,54,131]]]],[70,"e",[0,1],[",",[["*",127],["*",128],["*",126],["*",["|",[119,129]]]]]],[91,"t",[0,1,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[92,"e",[0,1,4,47,2,3],["~",[["*",132],["?",45],["?",133],["?",63],["?",134],["*",93],["*",94],["?",135],["?",136],["?",137],["?",62],["*",25],["?",71]]]],[138,"e",[],[",",[]]],[230,"e",[],[",",[]]],[139,"t",[0,1,4,2,3],5],[140,"t",[0,1,4,2,3],5],[231,"e",[],[",",[]]],[95,"t",[0,1,96,4,2],5],[141,"t",[0,1,72,4,2],5],[232,"e",[],[",",[]]],[233,"e",[],[",",[]]],[97,"t",[0,1,4,73,2,3],5],[234,"e",[],[",",[]]],[235,"e",[],[",",[]]],[236,"e",[],[",",[]]],[142,"t",[0,1,4,2,3],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]]]],[237,"e",[],[",",[]]],[90,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[143,"e",[0,1,4,2,3],[",",[144,["*",145]]]],[145,"e",[],[",",[]]],[144,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[98,"t",[0,1,73,4,2,3],5],[238,"e",[],[",",[]]],[239,"e",[],[",",[]]],[240,"e",[],[",",[]]],[146,"e",[],[",",[]]],[147,"e",[],[",",[]]],[241,"e",[],[",",[]]],[242,"e",[],[",",[]]],[148,"t",[0,1,2,3],5],[149,"t",[0,1,2,3],5],[99,"t",[0,1,4,73,2,3],5],[100,"t",[0,1,4,2,3],5],[101,"t",[0,1,4,2,3],5],[243,"e",[],[",",[]]],[102,"t",[0,1,4,73,2],5],[244,"e",[],[",",[]]],[245,"e",[],[",",[]]],[150,"e",[0,1,246,247,72,2,3,38,39,40,41,42,43],["~",[["?",91],["?",151],["?",152],["?",69],["?",153],["?",102],["?",99],["?",97],["?",100],["?",101],["*",154],["*",155],["*",149],["*",148],["?",156],["?",98],["?",74],["?",75],["?",76],["?",140],["?",139],["?",157],["?",158],["?",159],["?",160],["?",103],["?",71],["?",161]]]],[162,"e",[],[",",[]]],[132,"t",[0,1,4,2,3],5],[133,"t",[0,1,4,2,3],5],[63,"t",[0,1,4,63,2,3],5],[62,"t",[0,1,4,2,3,38,39,40,41,42,43],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[134,"t",[0,1,4,2],5],[93,"t",[0,1,4,2,3,38,39,40,41,42,43],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[163,"t",[0,1,248,4,2,3],5],[94,"e",[0,1],["*",["|",[93,163]]]],[135,"t",[0,1,4,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[136,"t",[0,1,4,2,3],5],[137,"t",[0,1,4,2,3],5],[71,"t",[0,1,4,2,3,38,39,40,41,42,43],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[249,"e",[],[",",[]]],[164,"e",[0,1,165,72,77,78,2],[",",[["?",["|",[[",",[["?",76],["?",75]]],104]]],["?",74],["?",105],["?",106]]]],[76,"t",[0,1,4,2,3],5],[75,"t",[0,1,4,2,3],5],[104,"t",[0,1,4,2,3],5],[105,"t",[0,1,4,2,3],5],[74,"t",[],5],[106,"t",[0,1,77,78,4,2,3],5],[166,"e",[],[",",[]]],[69,"e",[0,1,250,167,2,3,38,39,40,41,42,43],["~",[["?",62],23,["?",89],["*",24]]]],[124,"t",[0,1,251,252,4,2,3],5],[168,"e",[0,1],["+",["|",[67,68]]]],[67,"e",[0,1,4,169,2,3],[",",[["|",[[",",[170,["?",107]]],107]],["?",171],["?",172]]]],[68,"t",[0,1,4,169,2,3],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]]]],[253,"e",[],[",",[]]],[107,"t",[0,1,173],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[170,"t",[0,1,173],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[171,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[172,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[25,"t",[0,1,254,174,2,3,38,39,40,41,42,43],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[175,"t",[0,1,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[255,"e",[],[",",[]]],[45,"t",[0,1,108,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[131,"t",[0,1,256,4,2,3],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]]]],[55,"t",[0,1,4,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[257,"e",[],[",",[]]],[258,"e",[],[",",[]]],[259,"e",[],[",",[]]],[79,"e",[],[",",[]]],[125,"e",[0,1,47,4,2,3,38,39,40,41,42,43],["*",44]],[260,"e",[],[",",[]]],[176,"e",[],[",",[]]],[261,"e",[],[",",[]]],[262,"e",[],[",",[]]],[263,"e",[],[",",[]]],[264,"e",[],[",",[]]],[265,"e",[],[",",[]]],[36,"e",[],[",",[]]],[266,"e",[],[",",[]]],[177,"e",[0,1],[",",[["*",178],["?",179],["?",180],["*",89],["*",92],["*",181],["?",98],["?",97],["?",142],["?",141],["?",["|",[[",",[["?",[",",[99,["?",100]]]],["?",101]]],102]]],["?",182],["?",70],["*",183],["*",184],["*",109],["*",185]]]],[178,"t",[0,1,96,2],5],[179,"e",[0,1],["*",110]],[110,"e",[0,1,267,2,3],[",",[["+",["|",[186,187]]],["*",110]]]],[186,"t",[0,1,4],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[187,"e",[],[",",[]]],[268,"e",[],[",",[]]],[269,"e",[],[",",[]]],[270,"e",[],[",",[]]],[271,"e",[],[",",[]]],[272,"e",[],[",",[]]],[182,"e",[0,1],["*",164]],[273,"e",[],[",",[]]],[183,"e",[0,1,188,2,3],[",",[["?",55],["*",["|",[64,44]]]]]],[184,"e",[0,1,188,2,3],[",",[["?",55],["*",["|",[64,44]]]]]],[109,"e",[0,1,274,2,3],[",",[["?",45],["*",189]]]],[189,"t",[0,1,4],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]]]],[275,"e",[],[",",[]]],[276,"e",[],[",",[]]],[277,"e",[],[",",[]]],[278,"e",[],[",",[]]],[123,"e",[],[",",[]]],[181,"e",[0,1,279,72,165,77,78,3],["*",["|",[76,105,75,104,74,106]]]],[280,"e",[],[",",[]]],[281,"e",[],[",",[]]],[282,"e",[],[",",[]]],[283,"e",[],[",",[]]],[284,"e",[],[",",[]]],[285,"e",[],[",",[]]],[286,"e",[],[",",[]]],[287,"e",[],[",",[]]],[288,"e",[],[",",[]]],[289,"e",[],[",",[]]],[290,"e",[],[",",[]]],[291,"e",[],[",",[]]],[292,"e",[],[",",[]]],[180,"e",[0,1],[",",[91,["?",190],["*",143]]]],[190,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[293,"e",[],[",",[]]],[294,"e",[],[",",[]]],[295,"e",[],[",",[]]],[296,"e",[],[",",[]]],[111,"e",[0,1,4,2,3],[",",[["?",45],["?",55],["+",191]]]],[297,"e",[],[",",[]]],[192,"e",[],[",",[]]],[80,"e",[],[",",[]]],[81,"e",[],[",",[]]],[31,"e",[],[",",[]]],[82,"e",[0,1,56,57,2,3,4],[",",[["?",45],["+",65]]]],[65,"e",[0,1,56,57,2,3,298],[",",[["?",95],["?",45],["?",83],["*",109],112,["?",70]]]],[83,"e",[0,1,4,2,3,46],[",",[["?",55],["*",44]]]],[112,"e",[0,1,56,57,2,3,4,113,114,38,39,40,41,42,43],[",",[]]],[193,"e",[],[",",[]]],[33,"e",[0,1,4,2,299,114,113,3,38,39,40,41,42,43],["?",176]],[84,"t",[0,1,56,57,2,3,300,301],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,27,28,29,23,26,21,22]]]],[54,"e",[0,1,56,57,2,3,4,114,113,38,39,40,41,42,43],[",",[["?",45],["?",83]]]],[194,"e",[],[",",[]]],[85,"e",[0,1,56,57,2,3,4],[",",[["?",95],["?",45],["?",83],195,["?",70],["?",196]]]],[196,"e",[0,1],["?",111]],[302,"e",[],[",",[]]],[37,"e",[0,1],[",",[]]],[6,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[7,"t",[0,1,4,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[8,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[9,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[13,"e",[],[",",[]]],[14,"e",[],[",",[]]],[15,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[10,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[16,"t",[0,1,52,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[21,"t",[0,1,197,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[22,"t",[0,1,197,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[17,"t",[0,1,52,303,2],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[11,"e",[],[",",[]]],[12,"e",[],[",",[]]],[18,"e",[],[",",[]]],[19,"e",[],[",",[]]],[20,"e",[],[",",[]]],[304,"e",[],[",",[]]],[305,"e",[],[",",[]]],[306,"e",[],[",",[]]],[185,"e",[0,1,2,3],["*",198]],[307,"e",[],[",",[]]],[308,"e",[],[",",[]]],[198,"e",[0,1,47,199,2,3,38,39,40,41,42,43],[",",[["*",200],["*",201],["*",202],["*",203]]]],[200,"e",[0,1,47,309,63,2,3,38,39,40,41,42,43],94],[201,"t",[0,1,47,199,2,3,38,39,40,41,42,43],5],[202,"e",[],[",",[]]],[203,"e",[],[",",[]]],[204,"e",[],[",",[]]],[310,"e",[],[",",[]]],[311,"e",[],[",",[]]],[312,"e",[],[",",[]]],[313,"e",[],[",",[]]],[191,"e",[0,1,167,314,2,3],[",",[["?",45],["+",44]]]],[35,"e",[],[",",[]]],[24,"t",[0,1,315,108,47,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[30,"e",[],[",",[]]],[58,"e",[],[",",[]]],[316,"e",[],[",",[]]],[317,"e",[],[",",[]]],[318,"e",[],[",",[]]],[319,"e",[],[",",[]]],[53,"e",[0,1,320,321,322,323,2,3],["+",205]],[205,"e",[0,1,2,3],["+",["|",[44,53]]]],[32,"e",[0,1,4,2,3],115],[59,"e",[0,1,4,2,3],[",",[["?",45],115]]],[60,"e",[],[",",[]]],[115,"t",[0,1,4,2,324,103],5],[44,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,31,32,33,34,27,28,29,23,26,35,24,21,22,54]]]],[61,"e",[0,1,4,2,3],[",",[["+",44],["?",175]]]],[86,"e",[],[",",[]]],[325,"e",[],[",",[]]],[87,"e",[],[",",[]]],[88,"e",[],[",",[]]],[326,"e",[],[",",[]]],[27,"e",[],[",",[]]],[29,"e",[],[",",[]]],[28,"e",[],[",",[]]],[23,"t",[0,1,47,108,4,2,3,38,39,40,41,42,43],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,162,192,80,81,65,82,112,193,84,54,85,194,59,60,58,53,79,61,86,87,88]]]],[26,"e",[],[",",[]]],[206,"e",[0,1,4,2,3],["*",207]],[207,"e",[0,1,4,2,3],150],[327,"e",[],[",",[]]],[328,"e",[],[",",[]]],[151,"t",[0,1,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[152,"e",[],[",",[]]],[157,"t",[0,1,4,2,3],["*",["|",[5,62,25,71,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,23,26,21,22]]]],[161,"t",[0,1,77,78,4,2,3],5],[153,"t",[0,1,208,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[329,"e",[],[",",[]]],[158,"t",[0,1,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22,37]]]],[159,"t",[0,1,4,63,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[154,"e",[0,1,330,2,3],["*",["|",[146,69,166,67,168,68,92,138,147,90]]]],[155,"t",[0,1,96,174,2,38,39,40,41,42,43],5],[160,"t",[0,1,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[331,"e",[],[",",[]]],[332,"e",[],[",",[]]],[156,"t",[0,1,4,2,3],["*",["|",[5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22]]]],[333,"e",[],[",",[]]],[103,"t",[0,1,208,4,2,3],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[334,"e",[],[",",[]]],[335,"e",[],[",",[]]],[64,"e",[0,1,3,336,337,2],[",",[["?",55],["*",["|",[80,81,65,82,85,59,60,58,53,44,84,61,54,59,60,58,53,44,79,61,86,87,88]]],["*",64]]]],[338,"e",[],[",",[]]],[195,"e",[0,1,4,46,339,116,340,341,342,343,344,2],[",",[["|",[["*",117],["*",209]]],["|",[[",",[["?",210],["?",211],["+",212]]],["+",66]]]]]],[210,"e",[0,1,4,46,48,49,50,51],["+",66]],[211,"e",[0,1,4,46,48,49,50,51],["+",66]],[212,"e",[0,1,4,46,48,49,50,51],["+",66]],[209,"e",[0,1,4,46,213,116,48,49,50,51],["*",117]],[117,"e",[0,1,4,46,213,116,48,49,50,51],[",",[]]],[66,"e",[0,1,4,46,48,49,50,51],["+",["|",[214,215]]]],[214,"t",[0,1,4,46,216,217,218,219,220,221,48,49,50,51],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[215,"t",[0,1,4,46,216,217,218,219,220,221,48,49,50,51],["*",["|",[5,25,30,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,36,33,34,31,32,27,28,29,23,26,35,24,21,22]]]],[34,"e",[],[",",[]]],[345,"e",[],[",",[]]],[346,"e",[],[",",[]]],[118,"e",[0,1,347,2,3,348],[",",[222,["?",223],["?",224]]]],[222,"e",[0,1],[",",[["?",204],177]]],[223,"e",[0,1,2],["*",["|",[64,80,81,65,82,85,59,60,58,53,44,84,61,54,59,60,58,53,44,79,61,86,87,88]]]],[224,"e",[0,1],["~",[["?",111],["?",206]]]],[349,"e",[],[",",[]]],[350,"e",[],[",",[]]],[351,"e",[],[",",[]]]]]};

  let TextureJATS = textureXmlUtils_cjs_12(TextureJATSData,
    TEXTURE_JATS_PUBLIC_ID,
    TEXTURE_JATS_DTD
  );

  /* eslint-disable no-template-curly-in-string */
  var ArticleToolbarPackage = {
    name: 'article-toolbar',
    configure (config) {
      config.addToolPanel('toolbar', [
        {
          name: 'document-tools',
          type: 'group',
          style: 'minimal',
          items: [
            { type: 'command', name: 'undo' },
            { type: 'command', name: 'redo' },
            { type: 'command', name: 'save' }
          ]
        },
        {
          name: 'primary-annotations',
          type: 'group',
          style: 'minimal',
          items: [
            { type: 'command', name: 'toggle-bold', label: 'bold', icon: 'bold' },
            { type: 'command', name: 'toggle-italic', label: 'italic', icon: 'italic' },
            { type: 'command', name: 'create-external-link', label: 'link', icon: 'link' }
          ]
        },
        {
          name: 'insert',
          type: 'dropdown',
          style: 'descriptive',
          hideDisabled: true,
          alwaysVisible: true,
          items: [
            {
              name: 'content',
              type: 'group',
              items: [
                { type: 'command', name: 'insert-custom-abstract', label: 'custom-abstract' },
                { type: 'command', name: 'insert-figure', label: 'figure' },
                { type: 'command', name: 'insert-table', label: 'table' },
                { type: 'command', name: 'insert-block-quote', label: 'block-quote' },
                { type: 'command', name: 'insert-block-formula', label: 'equation' },
                { type: 'command', name: 'insert-file', label: 'file' },
                { type: 'command', name: 'insert-footnote', label: 'footnote' },
                { type: 'command', name: 'insert-reference', label: 'reference' }
              ]
            },
            {
              name: 'inline-content',
              type: 'group',
              label: 'inline',
              items: [
                { type: 'command', name: 'insert-inline-formula', label: 'math' },
                { type: 'command', name: 'insert-inline-graphic', label: 'inline-graphic' },
                { type: 'command', name: 'create-external-link', label: 'link', icon: 'link' },
                { type: 'command', name: 'insert-xref-bibr', label: 'citation' },
                { type: 'command', name: 'insert-xref-figure', label: 'figure-reference' },
                { type: 'command', name: 'insert-xref-table', label: 'table-reference' },
                { type: 'command', name: 'insert-xref-footnote', label: 'footnote-reference' },
                { type: 'command', name: 'insert-xref-formula', label: 'equation-reference' },
                { type: 'command', name: 'insert-xref-file', label: 'file-reference' }
              ]
            },
            {
              name: 'metadata',
              type: 'group',
              label: 'metadata',
              items: [
                { type: 'command', name: 'add-author', label: 'author' },
                { type: 'command', name: 'add-affiliation', label: 'affiliation' },
                { type: 'command', name: 'add-reference', label: 'reference' }
              ]
            }
          ]
        },
        {
          name: 'format',
          type: 'dropdown',
          style: 'descriptive',
          items: [
            { type: 'command', name: 'toggle-bold', label: 'bold' },
            { type: 'command', name: 'toggle-italic', label: 'italic' },
            { type: 'command', name: 'toggle-subscript', label: 'subscript' },
            { type: 'command', name: 'toggle-superscript', label: 'superscript' },
            { type: 'command', name: 'toggle-monospace', label: 'monospace' },
            { type: 'command', name: 'toggle-small-caps', label: 'small-caps' },
            { type: 'command', name: 'toggle-underline', label: 'underline' },
            { type: 'command', name: 'toggle-overline', label: 'overline' },
            { type: 'command', name: 'toggle-strike-through', label: 'strike-through' }
          ]
        },
        {
          name: 'text-types',
          type: 'dropdown',
          style: 'descriptive',
          hideDisabled: true,
          displayActiveCommand: true,
          items: [
            { type: 'command-group', name: 'text-types' }
          ]
        },
        {
          name: 'divider',
          type: 'spacer'
        },
        {
          name: 'context-tools',
          type: 'dropdown',
          style: 'descriptive',
          // hide disabled items but not the dropdown itself
          hideDisabled: true,
          alwaysVisible: true,
          items: [
            { type: 'command', name: 'edit-metadata', label: 'edit-metadata' },
            {
              type: 'group',
              name: 'table',
              style: 'descriptive',
              label: 'table-tools',
              items: [
                { type: 'command-group', name: 'table' },
                { type: 'command-group', name: 'table-insert' },
                { type: 'command-group', name: 'table-delete' }
              ]
            },
            {
              type: 'group',
              name: 'file',
              style: 'descriptive',
              label: 'file-tools',
              items: [
                { type: 'command-group', name: 'file' }
              ]
            },
            {
              type: 'group',
              name: 'figure',
              style: 'descriptive',
              label: 'figure-tools',
              items: [
                { type: 'command-group', name: 'figure-panel' }
              ]
            },
            {
              type: 'group',
              name: 'footnote',
              style: 'descriptive',
              label: 'footnote-tools',
              items: [
                { type: 'command-group', name: 'footnote' }
              ]
            },
            {
              type: 'group',
              name: 'list',
              style: 'descriptive',
              label: 'list-tools',
              items: [
                { type: 'command-group', name: 'list' }
              ]
            },
            {
              type: 'group',
              name: 'metadata-fields',
              style: 'descriptive',
              label: 'metadata-field-tools',
              items: [
                { type: 'command-group', name: 'metadata-fields' }
              ]
            },
            {
              type: 'group',
              name: 'author',
              style: 'descriptive',
              items: [
                { type: 'command-group', name: 'author' }
              ]
            },
            {
              type: 'group',
              name: 'reference',
              style: 'descriptive',
              items: [
                { type: 'command-group', name: 'reference' }
              ]
            },
            {
              type: 'group',
              name: 'text',
              style: 'descriptive',
              items: [
                { type: 'command-group', name: 'text' }
              ]
            },
            {
              type: 'group',
              name: 'entities',
              style: 'descriptive',
              items: [
                { type: 'command-group', name: 'entities' }
              ]
            },
            {
              type: 'group',
              name: 'collection',
              style: 'descriptive',
              items: [
                { type: 'command-group', name: 'collection' }
              ]
            }
          ]
        }
      ]);

      // Context menus
      config.addToolPanel('context-menu', [
        {
          name: 'context-menu',
          type: 'group',
          style: 'descriptive',
          hideDisabled: true,
          items: [
            { type: 'command-group', name: 'file' },
            { type: 'command-group', name: 'figure-panel' },
            { type: 'command-group', name: 'footnote' },
            { type: 'command-group', name: 'author' },
            { type: 'command-group', name: 'reference' },
            { type: 'command-group', name: 'entities' },
            { type: 'command-group', name: 'list' },
            { type: 'command-group', name: 'metadata-fields' }
          ]
        }
      ]);
      config.addToolPanel('table-context-menu', [
        {
          name: 'table-context-menu',
          type: 'group',
          style: 'descriptive',
          label: 'table',
          items: [
            { type: 'command-group', name: 'table-insert' },
            { type: 'command-group', name: 'table-delete' }
          ]
        }
      ]);

      // Icons
      config.addIcon('bold', { 'fontawesome': 'fa-bold' });
      config.addIcon('italic', { 'fontawesome': 'fa-italic' });
      config.addIcon('link', { 'fontawesome': 'fa-link' });

      // Format tools labels
      config.addLabel('format', 'Format');
      config.addLabel('bold', 'Bold');
      config.addLabel('italic', 'Italic');
      config.addLabel('link', 'Link');
      config.addLabel('monospace', 'Monospace');
      config.addLabel('overline', 'Overline');
      config.addLabel('small-caps', 'Small Caps');
      config.addLabel('strike-through', 'Strike Through');
      config.addLabel('subscript', 'Subscript');
      config.addLabel('superscript', 'Superscript');
      config.addLabel('underline', 'Underline');
      // List tools labels
      config.addLabel('list-tools', 'List');
      config.addLabel('indent-list', {
        en: 'Increase indentation',
        de: 'Einrückung vergrößern'
      });
      config.addLabel('dedent-list', {
        en: 'Decrease indentation',
        de: 'Einrückung verringern'
      });
      // Insert tools labels
      config.addLabel('insert', 'Insert');
      config.addLabel('table', 'Table');
      config.addLabel('block-quote', 'Block Quote');
      config.addLabel('equation', 'Equation');
      config.addLabel('file', 'File');
      config.addLabel('footnote', 'Footnote');
      config.addLabel('inline', 'Inline');
      config.addLabel('math', 'Math');
      config.addLabel('inline-graphic', 'Inline Graphic');
      config.addLabel('citation', 'Citation');
      config.addLabel('figure-reference', 'Figure Reference');
      config.addLabel('table-reference', 'Table Reference');
      config.addLabel('footnote-reference', 'Footnote Reference');
      config.addLabel('equation-reference', 'Equation Reference');
      config.addLabel('file-reference', 'File Reference');
      config.addLabel('metadata', 'Metadata');
      config.addLabel('reference', 'Reference');
      config.addLabel('author', 'Author');
      config.addLabel('editor', 'Editor');
      // Table tools labels
      config.addLabel('table-tools', 'Table');
      config.addLabel('insert-rows-above', {
        en: 'Insert ${nrows} rows above'
      });
      config.addLabel('insert-rows-below', {
        en: 'Insert ${nrows} rows below'
      });
      config.addLabel('insert-columns-left', {
        en: 'Insert ${ncols} columns left'
      });
      config.addLabel('insert-columns-right', {
        en: 'Insert ${ncols} columns right'
      });
      config.addLabel('delete-rows', {
        en: 'Delete ${nrows} rows'
      });
      config.addLabel('delete-columns', {
        en: 'Delete ${ncols} columns'
      });
      config.addLabel('toggle-cell-heading', {
        en: 'Cell heading'
      });
      config.addLabel('toggle-cell-merge', {
        en: 'Merge cell'
      });
      // File tools
      config.addLabel('file-tools', 'File');
      config.addLabel('replace-file', 'Replace File');
      config.addLabel('download-file', 'Download File');
      // Figure tools
      config.addLabel('figure-tools', 'Figure');
      config.addLabel('add-figure-panel', 'Add Panel');
      config.addLabel('replace-figure-panel-image', 'Replace Image');
      config.addLabel('remove-figure-panel', 'Remove Panel');
      config.addLabel('move-up-figure-panel', 'Move Panel Up');
      config.addLabel('move-down-figure-panel', 'Move Panel Down');
      config.addLabel('open-figure-panel-image', 'Open Image');
      // Footnote tools
      config.addLabel('footnote-tools', 'Footnote');
      config.addLabel('remove-footnote', 'Remove Footnote');
      // Collection tools
      config.addLabel('collection-tools', 'Collection');
      config.addLabel('move-up-col-item', 'Move Item Up');
      config.addLabel('move-down-col-item', 'Move Item Down');
      config.addLabel('remove-col-item', 'Remove Item');
      // Custom field tools
      config.addLabel('metadata-field-tools', 'Metadata');
      config.addLabel('add-metadata-field', 'Add Metadata Field');
      config.addLabel('move-down-metadata-field', 'Move Down Metadata Field');
      config.addLabel('move-up-metadata-field', 'Move Up Metadata Field');
      config.addLabel('remove-metadata-field', 'Remove Metadata Field');
      // Author tools
      config.addLabel('edit-author', 'Edit Author');
      // Reference tools
      config.addLabel('edit-reference', 'Edit Reference');
      config.addLabel('remove-reference', 'Remove Reference');
      // Context tools
      config.addLabel('context-tools', 'Edit');
      // Mode
      config.addLabel('mode', 'Mode');
      config.addLabel('mobile-mode', 'Mode');
    }
  };

  var ManuscriptContentPackage = {
    name: 'manuscript-content',
    configure (config) {
      config.addComponent('abstract', AbstractComponent);
      config.addComponent('authors-list', AuthorsListComponent);
      config.addComponent('bold', BoldComponent);
      config.addComponent('block-formula', BlockFormulaComponent);
      config.addComponent('block-quote', BlockQuoteComponent);
      config.addComponent('break', BreakComponent);
      config.addComponent('metadata-field', MetadataFieldComponent);
      config.addComponent('external-link', ExternalLinkComponent);
      config.addComponent('figure', FigureComponent);
      config.addComponent('figure-panel', FigurePanelComponent);
      config.addComponent('footnote', FootnoteComponent);
      config.addComponent('heading', HeadingComponent);
      config.addComponent('inline-formula', InlineFormulaComponent);
      config.addComponent('inline-graphic', InlineGraphicComponent);
      config.addComponent('italic', ItalicComponent);
      config.addComponent('list', ListComponent);
      config.addComponent('list-item', ListItemComponent);
      config.addComponent('manuscript', ManuscriptComponent);
      config.addComponent('monospace', substance.AnnotationComponent);
      config.addComponent('overline', substance.AnnotationComponent);
      config.addComponent('paragraph', ParagraphComponent);
      config.addComponent('reference', ReferenceComponent);
      config.addComponent('reference-list', ReferenceListComponent);
      config.addComponent('section-label', SectionLabel);
      config.addComponent('small-caps', substance.AnnotationComponent);
      config.addComponent('strike-through', substance.AnnotationComponent);
      config.addComponent('subscript', SubscriptComponent);
      config.addComponent('superscript', SuperscriptComponent);
      config.addComponent('table', TableComponent);
      config.addComponent('table-figure', TableFigureComponent);
      config.addComponent('underline', substance.AnnotationComponent);
      config.addComponent('unsupported-node', UnsupportedNodeComponent);
      config.addComponent('unsupported-inline-node', UnsupportedInlineNodeComponent);
      config.addComponent('xref', XrefComponent);

      config.addComponent('graphic', GraphicComponent);
      config.addComponent('supplementary-file', SupplementaryFileComponent);

      // TODO: either we use DefaultNodeComponent generally, but with better control over the look-and-feel
      // or we use it only in Metadata Editor, or in popups.
      // binding to 'entity' sounds no appropriate anymore, because we do not have the concept of 'Entity' anymore
      config.addComponent('entity', DefaultNodeComponent);
      config.addComponent('model-preview', ModelPreviewComponent);

      config.addLabel('abstract-label', 'Abstract');
      config.addLabel('abstract-placeholder', 'Enter abstract');
      config.addLabel('attribution-placeholder', 'Enter attribution');
      config.addLabel('authors-label', 'Authors');
      config.addLabel('body-label', 'Main text');
      config.addLabel('body-placeholder', 'Write your article here.');
      config.addLabel('caption-label', 'Caption');
      config.addLabel('caption-placeholder', 'Enter caption');
      config.addLabel('content-placeholder', 'Enter content');
      config.addLabel('file-upload-error', 'Something goes wrong');
      config.addLabel('file-upload-placeholder', 'Drag and drop or select item');
      // Note: we are registering a substring of other label to replace it with component
      config.addLabel('file-upload-select-placeholder', 'select');
      config.addLabel('footnote-placeholder', 'Enter footnote');
      config.addLabel('footnotes-label', 'Footnotes');
      config.addLabel('label-label', 'Label');
      config.addLabel('legend-label', 'Legend');
      config.addLabel('legend-placeholder', 'Enter legend');
      config.addLabel('metadata-label', 'Metadata');
      config.addLabel('references-label', 'References');
      config.addLabel('title-label', 'Title');
      config.addLabel('title-placeholder', 'Enter title');
      config.addLabel('subtitle-label', 'Subtitle');
      config.addLabel('subtitle-placeholder', 'Enter subtitle');
      config.addLabel('supplementary-file', 'Supplementary file');
      config.addLabel('supplementary-file-workflow-title', 'Add supplementary file');
      config.addLabel('supplementary-file-upload-label', 'Upload local file');
      config.addLabel('supplementary-file-link-label', 'Or use web link to downloadable file');
      config.addLabel('supplementary-file-link-placeholder', 'Enter url');

      // Used for rendering warning in case of missing images
      config.addIcon('graphic-load-error', { 'fontawesome': 'fa-warning' });
      config.addLabel('graphic-load-error', 'We couldn\'t load an image, sorry.');
    }
  };

  class SaveCommand extends substance.Command {
    getCommandState (params, context) {
      let archive = context.archive;
      if (!archive || !archive.hasPendingChanges()) {
        return substance.Command.DISABLED
      } else {
        return {
          disabled: false
        }
      }
    }

    execute (params, context) {
      context.editorSession.getRootComponent().send('save');
    }
  }

  var PersistencePackage = {
    name: 'Persistence',
    configure (config) {
      config.addCommand('save', SaveCommand, {
        commandGroup: 'persistence'
      });
      config.addIcon('save', { 'fontawesome': 'fa-save' });
      config.addLabel('save', 'Save Document');
      // TODO: enable this once we have global key handling in place
      // config.addKeyboardShortcut('CommandOrControl+S', { command: 'save' })
    }
  };

  var DropFigure = {
    type: 'drop-asset',
    match (params) {
      // Mime-type starts with 'image/'
      let isImage = params.file.type.indexOf('image/') === 0;
      return params.type === 'file' && isImage
    },
    drop (tx, params, context) {
      let api = context.api;
      api._insertFigures([params.file]);
    }
  };

  /**
   * Experimental: A base class for Workflows that are manipulating an EditorSession.
   *
   * Instead of directly manipulating the parent editor session,
   * a stage session is created, working on a clone of the document.
   * At the end, all changes are merged into one big change, which is then
   * applied to the parent editor session.
   *
   * It is not yet clear, how much this can be generalized. Thus is not part of the app kit yet.
   */
  class EditorWorkflow extends substance.Component {
    constructor (...args) {
      super(...args);

      this._initialize(this.props);
    }

    _initialize (props) {
      let parentEditorSession = this._getParentEditorSession();

      let config = this._getConfig();
      this.config = config;

      let editorSession = new substance.ModalEditorSession(this._getWorkflowId(), parentEditorSession, config, this._getInitialEditorState());
      this.editorSession = editorSession;

      this.appState = editorSession.editorState;

      let api = this._createAPI();
      this.api = api;

      let editor = this;
      const context = Object.assign(substance.createEditorContext(config, editorSession, editor), {
        api,
        editable: true
      });
      this.context = context;

      editorSession.setContext(context);
      editorSession.initialize();
    }

    _getConfig () {
      throw new Error('This method is abstract')
    }

    _getInitialEditorState () {
      // TODO: this might not be generic
      let parentEditorState = this._getParentEditorState();
      return {
        overlayId: null,
        settings: parentEditorState.settings
      }
    }

    _getWorkflowId () {
      return substance.uuid()
    }

    _getParentEditorState () {
      return this._getParentEditorSession().editorState
    }

    _getParentEditorSession () {
      return this._getParentContext().editorSession
    }

    _getParentContext () {
      return this.getParent().context
    }

    _createAPI () {
      throw new Error('This method is method is abstract.')
    }

    getActionHandlers () {
      return {
        executeCommand: this._executeCommand,
        toggleOverlay: this._toggleOverlay,
        scrollTo: this._scrollTo,
        scrollElementIntoView: this._scrollElementIntoView
      }
    }

    dispose () {
      this.editorSession.dispose();
    }

    render ($$) {
      let el = $$('div').addClass(this._getClassNames());
      // ATTENTION: don't let mousedowns and clicks pass, otherwise the parent will null the selection
      el.on('mousedown', this._onMousedown)
        .on('click', this._onClick);
      el.append(
        this._renderContent($$)
      );
      el.append(this._renderKeyTrap($$));
      return el
    }

    _renderKeyTrap ($$) {
      return $$('textarea').addClass('se-keytrap').ref('keytrap')
        .css({ position: 'absolute', width: 0, height: 0, opacity: 0 })
        .on('keydown', this._onKeydown)
        // TODO: copy'n'paste support?
        // .on('copy', this._onCopy)
        // .on('paste', this._onPaste)
        // .on('cut', this._onCut)
    }

    _renderContent ($$) {}

    _getClassNames () {
      return 'sc-editor-workflow'
    }

    beforeClose () {
      this.editorSession.commitChanges();
    }

    getComponentRegistry () {
      return this.config.getComponentRegistry()
    }

    getContentPanel () {
      return this.refs.contentPanel
    }

    _executeCommand (name, params) {
      this.editorSession.executeCommand(name, params);
    }

    _scrollElementIntoView (el, force) {
      this.refs.editor._scrollElementIntoView(el, force);
    }

    _scrollTo (params) {
      this.refs.editor._scrollTo(params);
    }

    _toggleOverlay (overlayId) {
      const appState = this.appState;
      if (appState.overlayId === overlayId) {
        appState.overlayId = null;
      } else {
        appState.overlayId = overlayId;
      }
      appState.propagateUpdates();
    }

    _onClick (e) {
      substance.domHelpers.stopAndPrevent(e);
      let focusedSurface = this.editorSession.getFocusedSurface();
      if (focusedSurface) {
        focusedSurface._blur();
      }
      this.editorSession.setSelection(null);
    }

    _onKeydown (e) {
      let handled = this.context.keyboardManager.onKeydown(e, this.context);
      if (handled) {
        e.stopPropagation();
        e.preventDefault();
      }
      return handled
    }

    _onMousedown (e) {
      e.stopPropagation();
    }
  }

  /**
   * This is an artificial model that takes all sorts of abstracts from the document model
   * so that they can be represented as individual cards
   */

  /**
   * This is an artificial Model used to control the content displayed in the Metadata view.
   */
  class MetadataModel {
    constructor (api) {
      this._api = api;
      this._sections = [
     /*   { name: 'article-information', model: new ArticleInformationSectionModel(api) },
        { name: 'abstracts', model: new AbstractsSectionModel(api) },
        { name: 'authors', model: createValueModel(api, ['metadata', 'authors']) },
        { name: 'editors', model: createValueModel(api, ['metadata', 'editors']) },
        { name: 'groups', model: createValueModel(api, ['metadata', 'groups']) },
        { name: 'affiliations', model: createValueModel(api, ['metadata', 'affiliations']) },
        { name: 'funders', model: createValueModel(api, ['metadata', 'funders']) },
        { name: 'keywords', model: createValueModel(api, ['metadata', 'keywords']) },
        { name: 'subjects', model: createValueModel(api, ['metadata', 'subjects']) },*/
        // TODO: references are not really metadata. This should be edited in the Manuscript directly
        // for the time being we leave it as it is
        { name: 'references', model: createValueModel(api, ['article', 'references']) }
      ];
    }

    getSections () {
      return this._sections
    }
  }

  class CardComponent extends substance.Component {
    didMount () {
      // Note: without a 'managed' approach every card component needs to listen to selection updates
      // TODO: consider to use a reducer that maps the selection to another variable, e.g. activeCard
      // then the cards would not be triggered on every other change
      this.context.editorState.addObserver(['selection'], this._onSelectionChange, this, { stage: 'render' });
    }

    dispose () {
      this.context.editorState.removeObserver(this);
    }

    render ($$) {
      const node = this.props.node;
      const nodeId = node.id;
      const children = this.props.children;
      const label = this.getLabel(this.props.label);
      const el = $$('div')
        .addClass(this._getClassNames())
        .attr('data-id', nodeId)
        .append(
          $$('div').addClass('se-label').append(label)
        );
      el.append(children);
      el.on('mousedown', this._onMousedown);
      el.on('click', this._onClick);
      return el
    }

    _getClassNames () {
      return `sc-card sm-${this.props.node.type}`
    }

    _toggleCardSelection () {
      const node = this.props.node;
      const api = this.context.api;
      api.selectCard(node.id);
    }

    _onSelectionChange (sel) {
      if (sel && sel.customType === 'card') {
        if (sel.nodeId === this.props.node.id) {
          this.el.addClass('sm-selected');
        } else {
          this.el.removeClass('sm-selected');
        }
      } else {
        this.el.removeClass('sm-selected');
      }
    }

    _onMousedown (e) {
      // Note: stopping propagation so that no-one else is doing somthing undesired
      // and selecting the card on right-mousedown
      e.stopPropagation();
      if (e.button === 2) {
        this._toggleCardSelection();
      }
    }

    _onClick (e) {
      substance.domHelpers.stopAndPrevent(e);
      this._toggleCardSelection();
    }
  }

  // Note: This is used for values of type 'collection'
  // where every item is rendered as a single card
  class MetadataCollectionComponent extends ModelComponent {
    render ($$) {
      const model = this.props.model;
      let items = model.getItems();
      let el = $$('div').addClass('sc-collection-editor');
      items.forEach(item => {
        let ItemEditor = this._getItemComponentClass(item);
        el.append(
          $$(CardComponent, {
            node: item,
            label: item.type
          // TODO: maybe it would be better to use an explicit prop, then the implicit one
          }).append(
            $$(ItemEditor, {
              node: item,
              mode: METADATA_MODE
            }).ref(item.id)
          )
        );
      });
      return el
    }

    // TODO: this should go into a common helper
    _getItemComponentClass (item) {
      let ItemComponent = this.getComponent(item.type, true);
      if (!ItemComponent) {
        // try to find a component registered for a parent type
        ItemComponent = this._getParentTypeComponent(item);
      }
      return ItemComponent || this.getComponent('entity')
    }

    // TODO: this should go into a common helper
    _getParentTypeComponent (node) {
      let superTypes = node.getSchema().getSuperTypes();
      for (let type of superTypes) {
        let NodeComponent = this.getComponent(type, true);
        if (NodeComponent) return NodeComponent
      }
    }
  }

  class MetadataSection extends substance.Component {
    didMount () {
      addModelObserver(this.props.model, this._onModelUpdate, this);
    }

    dispose () {
      removeModelObserver(this);
    }

    render ($$) {
      const model = this.props.model;
      const name = this.props.name;
      // const label = this.getLabel(model.id)
      let el = $$('div')
        .addClass('sc-metadata-section')
        .addClass(`sm-${name}`)
        .attr({
          'data-section': name
        });
      if (model.type === 'collection') {
        let label = this.getLabel(name);
        el.append(
          $$('div').addClass('se-heading').attr('id', model.id).append(
            $$('div').addClass('se-header').append(label)
          )
        );
        el.append(
          $$(MetadataCollectionComponent, { model })
        );
      } else {
        let CustomEditor = this.getComponent(model.id);
        let label = this.getLabel(name);
        el.append(
          $$('div').addClass('se-heading').attr('id', model.id).append(
            $$('div').addClass('se-header').append(label)
          )
        );
        el.append(
          $$(CustomEditor, { model })
        );
      }
      if (model.length === 0) {
        el.addClass('sm-empty');
      }
      return el
    }

    // ATTENTION: doing incremental update manually to avoid double rerendering of child collection
    // TODO: it would be good if Substance could avoid rerendering a component twice in one run
    _onModelUpdate () {
      let model = this.props.model;
      if (model.type === 'collection') {
        if (model.length === 0) {
          this.el.addClass('sm-empty');
        } else {
          this.el.removeClass('sm-empty');
        }
      }
    }
  }

  class MetadataSectionTOCEntry extends ModelComponent {
    render ($$) {
      const name = this.props.name;
      const model = this.props.model;
      let el = $$('div').addClass('sc-meta-section-toc-entry sc-toc-entry')
        .attr({ 'data-section': name })
        .on('click', this.handleClick);

      let label = this.getLabel(name);
      if (model.isCollection) {
        const items = model.getItems();
        if (items.length > 0) {
          label = label + ' (' + items.length + ')';
          el.append(label);
        } else {
          el.addClass('sm-empty');
        }
      } else {
        el.append(label);
      }

      return el
    }

    handleClick (event) {
      event.stopPropagation();
      event.preventDefault();
      // this is handled by MetadataEditor
      this.send('scrollTo', { section: this.props.name });
    }
  }

  /* eslint-disable no-use-before-define */

  /*
    EXPERIMENTAL: This should only be used as a prototype.
    After that must consolidate requirements and refactor.
  */

  class ExperimentalArticleValidator {
    // TODO: maybe we want to use ArticleAPI here
    constructor (api) {
      this._api = api;
    }

    initialize () {
      let article = this._getArticle();
      let editorState = this._getEditorState();
      substance.forEach(article.getNodes(), node => {
        CheckRequiredFields.onCreate(this, node);
      });
      // TODO: or should we bind to editorState updates?
      editorState.addObserver(['document'], this._onDocumentChange, this, { stage: 'update' });
    }

    dispose () {
      let editorState = this._getEditorState();
      editorState.removeObserver(this);
    }

    /*
      Thought: potentially there are different kind of issues
    */
    clearIssues (path, type) {
      // Note: storing the issues grouped by propertyName in node['@issues']
      let nodeIssues = this._getNodeIssues(path[0]);
      nodeIssues.clear(substance.getKeyForPath(path.slice(1)), type);
      this._markAsDirty(path);
    }

    /*
      Thoughts: adding issues one-by-one, and clearing by type
    */
    addIssue (path, issue) {
      // console.log('ArticleValidator: adding issue for %s', getKeyForPath(path), issue)
      let nodeIssues = this._getNodeIssues(path[0]);
      nodeIssues.add(substance.getKeyForPath(path.slice(1)), issue);
      this._markAsDirty(path);
    }

    _getEditorState () {
      return this._api.editorSession.editorState
    }

    _markAsDirty (path) {
      let editorState = this._getEditorState();
      // Note: marking both the node and the property as dirty
      const documentObserver = editorState._getDocumentObserver();
      const nodeId = path[0];
      let issuesPath = [nodeId, '@issues'];
      documentObserver.setDirty(issuesPath);
      documentObserver.setDirty(issuesPath.concat(path.slice(1)));
    }

    _getNodeIssues (nodeId) {
      const article = this._getArticle();
      let node = article.get(nodeId);
      let issues = node['@issues'];
      if (!issues) {
        issues = new NodeIssues();
        node['@issues'] = issues;
      }
      return issues
    }

    /*
      Thoughts: the validator is triggered on document change, analyzing the change
      and triggering registered validators accordingly.
    */
    _onDocumentChange (change) {
      // ATTENTION: this is only a prototype implementation
      // This must be redesigned/rewritten when we move further
      const article = this._getArticle();
      // TODO: a DocumentChange could carry a lot more information
      // e.g. uodated[key] = { path, node, value }
      // It would also be better to separate explicit updates (~op.path) from derived updates (node id, annotation updates)
      Object.keys(change.created).forEach(id => {
        let node = article.get(id);
        if (node) {
          CheckRequiredFields.onCreate(this, node);
        }
      });
      Object.keys(change.updated).forEach(key => {
        let path = key.split('.');
        let node = article.get(path[0]);
        if (node) {
          CheckRequiredFields.onUpdate(this, node, path, article.get(path));
        }
      });
    }

    _getArticle () {
      return this._api.getDocument()
    }

    _getApi () {
      return this._api
    }
  }

  const FIELD_IS_REQUIRED = {
    type: 'required-fields',
    label: 'field-is-required',
    message: 'Field is required'
  };

  const CheckRequiredFields = {
    onCreate (validator, node) {
      const api = validator._getApi();
      let data = node.toJSON();
      Object.keys(data).forEach(name => {
        if (api._isFieldRequired([node.type, name])) {
          this.onUpdate(validator, node, [node.id, name], data[name]);
        }
      });
    },
    onUpdate (validator, node, path, value) {
      const api = validator._getApi();
      if (api._isFieldRequired([node.type].concat(path.slice(1)))) {
        validator.clearIssues(path, FIELD_IS_REQUIRED.type);
        // TODO: we probably want to use smarter validators than this
        if (substance.isNil(value) || value === '') {
          validator.addIssue(path, FIELD_IS_REQUIRED);
        }
      }
    }
  };

  class NodeIssues {
    constructor () {
      this._issuesByProperty = new Map();
    }

    get (propName) {
      return this._issuesByProperty.get(propName)
    }

    add (propName, issue) {
      if (!this._issuesByProperty.has(propName)) {
        this._issuesByProperty.set(propName, []);
      }
      let issues = this._issuesByProperty.get(propName);
      issues.push(issue);
    }

    clear (propName, type) {
      if (this._issuesByProperty.has(propName)) {
        let issues = this._issuesByProperty.get(propName);
        for (let i = issues.length - 1; i >= 0; i--) {
          if (issues[i].type === type) {
            issues.splice(i, 1);
          }
        }
        if (issues.length === 0) {
          this._issuesByProperty.delete(propName);
        }
      }
    }

    get size () {
      let size = 0;
      this._issuesByProperty.forEach(issues => {
        size += issues.length;
      });
      return size
    }
  }

  class MetadataEditor extends substance.Component {
    constructor (...args) {
      super(...args);

      this._initialize(this.props);
    }

    _initialize (props) {
      this.articleValidator = new ExperimentalArticleValidator(this.context.api);
      this.model = new MetadataModel(this.context.editorSession);

      // HACK: this is making all properties dirty, so we have to reset the appState after that
      this.articleValidator.initialize();
      this.context.editorState._reset();
    }

    getActionHandlers () {
      return {
        'acquireOverlay': this._acquireOverlay,
        'releaseOverlay': this._releaseOverlay
      }
    }

    didMount () {
      this._showHideTOC();
      substance.DefaultDOMElement.getBrowserWindow().on('resize', this._showHideTOC, this);
      this.context.editorSession.setRootComponent(this._getContentPanel());
    }

    dispose () {
      this.articleValidator.dispose();
      substance.DefaultDOMElement.getBrowserWindow().off(this);
    }

    render ($$) {
      let el = $$('div').addClass('sc-metadata-editor');
      el.append(
        this._renderMainSection($$)
      );
      el.on('keydown', this._onKeydown);
      return el
    }

    _renderMainSection ($$) {
      let mainSection = $$('div').addClass('se-main-section');
      mainSection.append(
        this._renderToolbar($$),
        $$('div').addClass('se-content-section').append(
          this._renderTOCPane($$),
          this._renderContentPanel($$)
        // TODO: do we need this ref?
        ).ref('contentSection')
      );
      return mainSection
    }

    _renderToolbar ($$) {
      const Toolbar = this.getComponent('toolbar');
      let config = this.context.config;
      const items = config.getToolPanel('toolbar');
      return $$('div').addClass('se-toolbar-wrapper').append(
        $$(Managed(Toolbar), {
          items,
          bindings: ['commandStates']
        }).ref('toolbar')
      )
    }

    _renderTOCPane ($$) {
      const sections = this.model.getSections();
      let el = $$('div').addClass('se-toc-pane').ref('tocPane');
      let tocEl = $$('div').addClass('se-toc');
      sections.forEach(({ name, model }) => {
        let id = model.id;
        tocEl.append(
          $$(MetadataSectionTOCEntry, {
            id,
            name,
            model
          })
        );
      });
      el.append(tocEl);
      return el
    }

    _renderContentPanel ($$) {
      const sections = this.model.getSections();
      const ScrollPane = this.getComponent('scroll-pane');

      let contentPanel = $$(ScrollPane, {
        contextMenu: 'custom',
        scrollbarPosition: 'right'
      // NOTE: this ref is needed to access the root element of the editable content
      }).ref('contentPanel');

      let sectionsEl = $$('div').addClass('se-sections');

      sections.forEach(({ name, model }) => {
        let content = $$(MetadataSection, { name, model }).ref(name);
        sectionsEl.append(content);
      });

      contentPanel.append(
        sectionsEl.ref('sections'),
        this._renderMainOverlay($$),
        this._renderContextMenu($$)
      );

      return contentPanel
    }

    _renderMainOverlay ($$) {
      const panelProvider = () => this.refs.contentPanel;
      return $$(OverlayCanvas, {
        panelProvider,
        theme: this._getTheme()
      }).ref('overlay')
    }

    _renderContextMenu ($$) {
      const config = this.context.config;
      const ContextMenu = this.getComponent('context-menu');
      const items = config.getToolPanel('context-menu');
      return $$(Managed(ContextMenu), {
        items,
        theme: this._getTheme(),
        bindings: ['commandStates']
      })
    }

    _getContentPanel () {
      return this.refs.contentPanel
    }

    _getTheme () {
      return 'dark'
    }

    _onKeydown (e) {
      let handled = this.context.keyboardManager.onKeydown(e, this.context);
      if (handled) {
        e.stopPropagation();
        e.preventDefault();
      }
      return handled
    }

    _scrollElementIntoView (el, force) {
      this._getContentPanel().scrollElementIntoView(el, !force);
    }

    _scrollTo (params) {
      let selector;
      if (params.nodeId) {
        selector = `[data-id="${params.nodeId}"]`;
      } else if (params.section) {
        selector = `[data-section="${params.section}"]`;
      } else {
        throw new Error('Illegal argument')
      }
      let comp = this.refs.contentPanel.find(selector);
      if (comp) {
        this._scrollElementIntoView(comp.el, true);
      }
    }

    _showHideTOC () {
      let contentSectionWidth = this.refs.contentSection.el.width;
      if (contentSectionWidth < 960) {
        this.el.addClass('sm-compact');
      } else {
        this.el.removeClass('sm-compact');
      }
    }

    _acquireOverlay (...args) {
      this.refs.overlay.acquireOverlay(...args);
    }

    _releaseOverlay (...args) {
      this.refs.overlay.releaseOverlay(...args);
    }
  }

  class MetadataAPI extends ArticleAPI {
    selectCard (nodeId) {
      this._setSelection(this._createCardSelection(nodeId));
    }

    _createEntitySelection (node) {
      return this._selectFirstRequiredPropertyOfMetadataCard(node)
    }

    _createCardSelection (nodeId) {
      return {
        type: 'custom',
        customType: 'card',
        nodeId
      }
    }

    // ATTENTION: this only works for meta-data cards, thus the special naming
    _selectFirstRequiredPropertyOfMetadataCard (node) {
      let prop = this._getFirstRequiredProperty(node);
      if (prop) {
        if (prop.isText() || prop.type === 'string') {
          let path = [node.id, prop.name];
          return {
            type: 'property',
            path,
            startOffset: 0,
            surfaceId: this._getSurfaceId(node, prop.name, 'metadata')
          }
        } else if (prop.isContainer()) {
          let nodes = node.resolve(prop.name);
          let first = nodes[0];
          if (first && first.isText()) {
            let path = first.getPath();
            return {
              type: 'property',
              path,
              startOffset: 0,
              surfaceId: this._getSurfaceId(node, prop.name, 'metadata')
            }
          }
        } else {
          console.error('FIXME: set the cursor into a property of unsupported type');
        }
      }
      // otherwise fall back to 'card' selection
      return this._createCardSelection(node.id)
    }
  }

  class EditMetadataWorkflow extends EditorWorkflow {
    didMount () {
      super.didMount();

      this.appState.addObserver(['selection'], this._onSelectionChange, this, { stage: 'finalize' });

      // scroll to the node if a workflow props are given
      // Note: this has to be done after everything as been mounted
      if (this.props.nodeId) {
        this.api.selectEntity(this.props.nodeId);
      }
    }

    dispose () {
      super.dispose();

      this.appState.removeObserver(this);
    }

    _renderContent ($$) {
      // ATTENTION: ATM it is important to use 'editor' ref
      return $$(MetadataEditor).ref('editor')
    }

    _getClassNames () {
      return 'sc-edit-metadata-workflow sc-editor-workflow'
    }

    _getConfig () {
      return this.getParent().context.config.getConfiguration('metadata')
    }

    _getWorkflowId () {
      return 'edit-metadata-workflow'
    }

    _createAPI () {
      return new MetadataAPI(this.editorSession, this.context.archive, this.config, this)
    }

    _onSelectionChange (sel) {
      if (!sel || sel.isNull() || sel.isCustomSelection()) {
        this.refs.keytrap.el.focus({ preventScroll: true });
      }
    }
  }

  class AddReferenceWorkflow extends substance.Component {
    static get desiredWidth () {
      return 'large'
    }

    get supportedUploadFormats () {
      return ['CSL-JSON']
    }

    didMount () {
      super.didMount();

      this.handleActions({
        'importBib': this._onImport
      });
    }

    render ($$) {
      let el = $$('div').addClass('sc-add-reference sm-workflow');

      const title = $$('div').addClass('se-title').append(
        this.getLabel('add-reference-title')
      );

      const refTypesButtons = $$('ul').addClass('se-reftypes-list');
      INTERNAL_BIBR_TYPES.forEach(item => {
        refTypesButtons.append(
          $$('li').addClass('se-type sm-' + item).append(
            this.getLabel(item)
          ).on('click', this._onAdd.bind(this, item))
        );
      });
      const manualAddEl = $$('div').addClass('se-manual-add').append(refTypesButtons);

      el.append(
        title,
        $$(DialogSectionComponent, { label: this.getLabel('fetch-datacite') })
          .append($$(DOIInputComponent)),
        $$(DialogSectionComponent, {
          label: this.getLabel('import-refs'),
          description: this.getLabel('supported-ref-formats') + ': ' + this.supportedUploadFormats.join(', ')
        }).append($$(ReferenceUploadComponent)),
        $$(DialogSectionComponent, { label: this.getLabel('add-ref-manually') })
          .append(manualAddEl)
      );

      return el
    }

    _onAdd (type) {
      this.context.api.addReference({ type });
      this.send('closeModal');
      this._openEditReference();
    }

    _onImport (items) {
      this.context.api.addReferences(items);
      this.send('closeModal');
      this._openEditReference();
    }

    _openEditReference () {
      this.send('executeCommand', 'edit-reference');
    }
  }

  /* eslint-disable no-template-curly-in-string */

  var ManuscriptPackage = {
    name: 'ManuscriptEditor',
    configure (config) {
      config.import(BasePackage);
      config.import(EditorBasePackage);
      config.import(ModelComponentPackage);
      config.import(ManuscriptContentPackage);
      config.import(ArticleToolbarPackage);
      config.import(PersistencePackage);
      config.import(substance.FindAndReplacePackage);

      config.addComponent('add-supplementary-file', AddSupplementaryFileWorkflow);
      config.addComponent('toc', ManuscriptTOC);

      //config.addCommand('add-author', AddAuthorCommand)
      config.addCommand('add-figure-panel', AddFigurePanelCommand, {
        commandGroup: 'figure-panel'
      });
      config.addCommand('add-metadata-field', AddFigureMetadataFieldCommand, {
        commandGroup: 'metadata-fields'
      });
      //config.addCommand('add-affiliation', AddAffiliationCommand)
      config.addCommand('add-reference', AddAuthorCommand$1);

      config.addCommand('create-external-link', InsertExtLinkCommand, {
        nodeType: 'external-link',
        accelerator: 'CommandOrControl+K',
        commandGroup: 'formatting'
      });
      config.addCommand('decrease-heading-level', DecreaseHeadingLevelCommand, {
        commandGroup: 'text'
      });
      config.addCommand('dedent-list', substance.IndentListCommand, {
        spec: { action: 'dedent' },
        commandGroup: 'list'
      });
      config.addCommand('delete-columns', DeleteCellsCommand, {
        spec: { dim: 'col' },
        commandGroup: 'table-delete'
      });
      config.addCommand('delete-rows', DeleteCellsCommand, {
        spec: { dim: 'row' },
        commandGroup: 'table-delete'
      });
      config.addCommand('download-file', DownloadSupplementaryFileCommand, {
        commandGroup: 'file'
      });
      config.addCommand('edit-author', EditAuthorCommand, {
        commandGroup: 'entities'
      });
      config.addCommand('edit-metadata', EditMetadataCommand);
      config.addCommand('edit-reference', EditReferenceCommand, {
        commandGroup: 'entities'
      });
      config.addCommand('increase-heading-level', IncreaseHeadingLevelCommand, {
        commandGroup: 'text'
      });
      config.addCommand('indent-list', substance.IndentListCommand, {
        spec: { action: 'indent' },
        commandGroup: 'list'
      });
      config.addCommand('insert-block-formula', InsertBlockFormulaCommand, {
        nodeType: 'block-formula',
        commandGroup: 'insert'
      });
      config.addCommand('insert-block-quote', InsertBlockQuoteCommand, {
        nodeType: 'block-quote',
        commandGroup: 'insert'
      });
      config.addCommand('insert-columns-left', InsertCellsCommand, {
        spec: { dim: 'col', pos: 'left' },
        commandGroup: 'table-insert'
      });
      config.addCommand('insert-columns-right', InsertCellsCommand, {
        spec: { dim: 'col', pos: 'right' },
        commandGroup: 'table-insert'
      });
      config.addCommand('insert-figure', InsertFigureCommand, {
        nodeType: 'figure',
        commandGroup: 'insert'
      });
      config.addCommand('insert-file', InsertNodeFromWorkflowCommand, {
        workflow: 'add-supplementary-file',
        nodeType: 'supplementary-file',
        commandGroup: 'insert'
      });
      config.addCommand('insert-footnote', InsertFootnoteCommand, {
        commandGroup: 'insert'
      });
      config.addCommand('insert-inline-formula', InsertInlineFormulaCommand, {
        commandGroup: 'insert'
      });
      config.addCommand('insert-inline-graphic', InsertInlineGraphicCommand, {
        nodeType: 'inline-graphic',
        commandGroup: 'insert'
      });
      config.addCommand('insert-rows-above', InsertCellsCommand, {
        spec: { dim: 'row', pos: 'above' },
        commandGroup: 'table-insert'
      });
      config.addCommand('insert-rows-below', InsertCellsCommand, {
        spec: { dim: 'row', pos: 'below' },
        commandGroup: 'table-insert'
      });
      config.addCommand('insert-table', InsertTableCommand, {
        nodeType: 'table-figure',
        commandGroup: 'insert'
      });
      config.addCommand('insert-xref-bibr', InsertCrossReferenceCommand, {
        refType: Reference.refType,
        commandGroup: 'insert-xref'
      });
      config.addCommand('insert-xref-figure', InsertCrossReferenceCommand, {
        refType: Figure.refType,
        commandGroup: 'insert-xref'
      });
      config.addCommand('insert-xref-file', InsertCrossReferenceCommand, {
        refType: SupplementaryFile.refType,
        commandGroup: 'insert-xref'
      });
      // Note: footnote cross-references are special, because they take the current scope into account
      // i.e. whether to create a footnote on article level, or inside a table-figure
      config.addCommand('insert-xref-footnote', InsertFootnoteCrossReferenceCommand, {
        commandGroup: 'insert-xref'
      });
      config.addCommand('insert-xref-formula', InsertCrossReferenceCommand, {
        refType: BlockFormula.refType,
        commandGroup: 'insert-xref'
      });
      config.addCommand('insert-xref-table', InsertCrossReferenceCommand, {
        refType: Table.refType,
        commandGroup: 'insert-xref'
      });
      config.addCommand('move-down-metadata-field', MoveMetadataFieldCommand, {
        direction: 'down',
        commandGroup: 'metadata-fields'
      });
      config.addCommand('move-down-figure-panel', MoveFigurePanelCommand, {
        direction: 'down',
        commandGroup: 'figure-panel'
      });
      config.addCommand('move-up-metadata-field', MoveMetadataFieldCommand, {
        direction: 'up',
        commandGroup: 'metadata-fields'
      });
      config.addCommand('move-up-figure-panel', MoveFigurePanelCommand, {
        direction: 'up',
        commandGroup: 'figure-panel'
      });
      config.addCommand('open-figure-panel-image', OpenFigurePanelImageCommand, {
        commandGroup: 'figure-panel'
      });
      config.addCommand('remove-metadata-field', RemoveMetadataFieldCommand, {
        commandGroup: 'metadata-fields'
      });
      config.addCommand('remove-figure-panel', RemoveFigurePanelCommand, {
        commandGroup: 'figure-panel'
      });
      config.addCommand('remove-footnote', RemoveFootnoteCommand, {
        nodeType: 'footnote',
        commandGroup: 'footnote'
      });
      config.addCommand('replace-figure-panel-image', ReplaceFigurePanelImageCommand, {
        commandGroup: 'figure-panel'
      });
      config.addCommand('replace-file', ReplaceSupplementaryFileCommand, {
        commandGroup: 'file'
      });
      config.addCommand('table:select-all', TableSelectAllCommand);
      config.addCommand('toggle-bold', substance.AnnotationCommand, {
        nodeType: 'bold',
        accelerator: 'CommandOrControl+B',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-cell-heading', ToggleCellHeadingCommand, {
        commandGroup: 'table'
      });
      config.addCommand('toggle-cell-merge', ToggleCellMergeCommand, {
        commandGroup: 'table'
      });
      config.addCommand('toggle-italic', substance.AnnotationCommand, {
        nodeType: 'italic',
        accelerator: 'CommandOrControl+I',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-monospace', substance.AnnotationCommand, {
        nodeType: 'monospace',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-ordered-list', ChangeListTypeCommand, {
        spec: { listType: 'order' },
        commandGroup: 'list'
      });
      config.addCommand('toggle-overline', substance.AnnotationCommand, {
        nodeType: 'overline',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-small-caps', substance.AnnotationCommand, {
        nodeType: 'small-caps',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-strike-through', substance.AnnotationCommand, {
        nodeType: 'strike-through',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-subscript', substance.AnnotationCommand, {
        nodeType: 'subscript',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-superscript', substance.AnnotationCommand, {
        nodeType: 'superscript',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-underline', substance.AnnotationCommand, {
        nodeType: 'underline',
        commandGroup: 'formatting'
      });
      config.addCommand('toggle-unordered-list', ChangeListTypeCommand, {
        spec: { listType: 'bullet' },
        commandGroup: 'list'
      });

      // Workflows
      //config.addComponent('add-affiliation-workflow', AddAffiliationWorkflow)
      //config.addComponent('add-author-workflow', AddAuthorWorkflow)
      config.addComponent('add-reference-workflow', AddReferenceWorkflow);
      config.addComponent('edit-metadata-workflow', EditMetadataWorkflow);

      // Labels
     // config.addLabel('add-author', 'Add Author')
      config.addLabel('add-ref', 'Add Reference');
      //config.addLabel('article-info', 'Article Information')
      //config.addLabel('article-record', 'Article Record')
      //config.addLabel('contributors', 'Authors & Contributors')
      config.addLabel('create-unordered-list', 'Bulleted list');
      config.addLabel('create-ordered-list', 'Numbered list');
      config.addLabel('edit-metadata', 'Edit Metadata');
      config.addLabel('edit-ref', 'Edit Reference');
      config.addLabel('file-location', 'File location');
      config.addLabel('file-name', 'File name');
      config.addLabel('manuscript-start', 'Article starts here');
      config.addLabel('manuscript-end', 'Article ends here');
      config.addLabel('no-authors', 'No Authors');
      config.addLabel('no-editors', 'No Editors');
      config.addLabel('no-references', 'No References');
      config.addLabel('no-footnotes', 'No Footnotes');
      config.addLabel('open-link', 'Open Link');
      config.addLabel('pub-data', 'Publication Data');
      config.addLabel('sig-block-start', 'Signature Block starts here');
      config.addLabel('sig-block-end', 'Signature Block ends here');
      config.addLabel('structure', 'Structure');
      config.addLabel('toc', 'Table of Contents');
      config.addLabel('remove-ref', 'Remove');
      config.addLabel('toggle-unordered-list', 'Bulleted list');
      config.addLabel('toggle-ordered-list', 'Numbered list');
      config.addLabel('enter-custom-field-name', 'Enter name');
      config.addLabel('enter-custom-field-value', 'Enter value');
      config.addLabel('add-action', 'Add');
      config.addLabel('enter-url-placeholder', 'Enter url');

      // These labels are used by the AddReferenceWorkflow only
      config.addLabel('add-reference-title', 'Add Reference(s)');
      config.addLabel('add-ref-manually', 'Or create manually');
      config.addLabel('fetch-datacite', 'Fetch by DOI from DataCite or Crossref');
      config.addLabel('enter-doi-placeholder', 'Enter one or more DOIs');
      config.addLabel('import-refs', 'Import');

      // Icons
      config.addIcon('create-unordered-list', { 'fontawesome': 'fa-list-ul' });
      config.addIcon('create-ordered-list', { 'fontawesome': 'fa-list-ol' });
      config.addIcon('open-link', { 'fontawesome': 'fa-external-link' });
      config.addIcon('pencil', { 'fontawesome': 'fa-pencil' });
      config.addIcon('toggle-unordered-list', { 'fontawesome': 'fa-list-ul' });
      config.addIcon('toggle-ordered-list', { 'fontawesome': 'fa-list-ol' });
      config.addIcon('trash', { 'fontawesome': 'fa-trash' });
      config.addIcon('input-loading', { 'fontawesome': 'fa-spinner fa-spin' });
      config.addIcon('input-error', { 'fontawesome': 'fa-exclamation-circle' });
      config.addIcon('left-control', { 'fontawesome': 'fa-chevron-left' });
      config.addIcon('right-control', { 'fontawesome': 'fa-chevron-right' });

      // Tools
      config.addComponent('add-figure-panel', InsertFigurePanelTool);
      config.addComponent('download-file', DownloadSupplementaryFileTool);
      config.addComponent('insert-figure', InsertFigureTool);
      config.addComponent('insert-inline-graphic', InsertInlineGraphicTool);
      config.addComponent('open-figure-panel-image', OpenFigurePanelImageTool);
      config.addComponent('replace-figure-panel-image', ReplaceFigurePanelTool);
      config.addComponent('replace-file', ReplaceSupplementaryFileTool);
      config.addComponent('insert-table', InsertTableTool);

      // DropDownHandler
      config.addDropHandler(DropFigure);

      // SwitchTextTypes
      config.addTextTypeTool({
        name: 'switch-to-heading1',
        commandGroup: 'text-types',
        nodeSpec: {
          type: 'heading',
          level: 1
        },
        icon: 'fa-header',
        label: 'Heading 1',
        accelerator: 'CommandOrControl+Alt+1'
      });
      config.addTextTypeTool({
        name: 'switch-to-heading2',
        commandGroup: 'text-types',
        nodeSpec: {
          type: 'heading',
          level: 2
        },
        icon: 'fa-header',
        label: 'Heading 2',
        accelerator: 'CommandOrControl+Alt+2'
      });
      config.addTextTypeTool({
        name: 'switch-to-heading3',
        commandGroup: 'text-types',
        nodeSpec: {
          type: 'heading',
          level: 3
        },
        icon: 'fa-header',
        label: 'Heading 3',
        accelerator: 'CommandOrControl+Alt+3'
      });
      config.addTextTypeTool({
        name: 'switch-to-paragraph',
        commandGroup: 'text-types',
        nodeSpec: {
          type: 'paragraph'
        },
        icon: 'fa-paragraph',
        label: 'Paragraph',
        accelerator: 'CommandOrControl+Alt+0'
      });
      config.addCommand('create-unordered-list', CreateListCommand, {
        spec: { listType: 'bullet' },
        commandGroup: 'text-types'
      });
      config.addCommand('create-ordered-list', CreateListCommand, {
        spec: { listType: 'order' },
        commandGroup: 'text-types'
      });
      config.addTextTypeTool({
        name: 'switch-to-preformat',
        commandGroup: 'text-types',
        nodeSpec: {
          type: 'preformat'
        },
        icon: 'fa-font',
        label: 'Preformat',
        accelerator: 'CommandOrControl+E'
      });

      // Toolpanels
      config.addToolPanel('main-overlay', [
        {
          name: 'prompt',
          type: 'prompt',
          style: 'minimal',
          hideDisabled: true,
          items: [
            { type: 'command-group', name: 'prompt' }
          ]
        }
      ]);

      config.addToolPanel('workflow', [
        {
          name: 'workflow',
          type: 'group',
          items: [
            { type: 'command-group', name: 'workflows' }
          ]
        }
      ]);

      // KeyboardShortcuts
      config.addKeyboardShortcut('CommandOrControl+a', { command: 'table:select-all' });

      // Register commands and keyboard shortcuts for collections
      // registerCollectionCommand(config, 'author', ['metadata', 'authors'], { keyboardShortcut: 'CommandOrControl+Alt+A', nodeType: 'person' })
      //registerCollectionCommand(config, 'funder', ['metadata', 'funders'], { keyboardShortcut: 'CommandOrControl+Alt+Y' })
      //registerCollectionCommand(config, 'editor', ['metadata', 'editors'], { keyboardShortcut: 'CommandOrControl+Alt+E', nodeType: 'person' })
      //registerCollectionCommand(config, 'group', ['metadata', 'groups'], { keyboardShortcut: 'CommandOrControl+Alt+G' })
      //registerCollectionCommand(config, 'keyword', ['metadata', 'keywords'], { keyboardShortcut: 'CommandOrControl+Alt+K' })
      //registerCollectionCommand(config, 'affiliation', ['metadata', 'affiliations'], { keyboardShortcut: 'CommandOrControl+Alt+O' })
      //registerCollectionCommand(config, 'subject', ['metadata', 'subjects'])
    },
    ManuscriptEditor,
    // legacy
    Editor: ManuscriptEditor
  };

  /* eslint-disable no-template-curly-in-string */
  var EntityLabelsPackage = {
    name: 'entity-labels',
    configure (config) {
      // EXPERIMENTAL: I want to move to more natural label specifications
      config.addLabel('enter-something', 'Enter ${something}');

      // TODO: at some point I want to refactor the configuration so that we have only one place for labels

      // general
      config.addLabel('edit-references', 'Edit References');
      config.addLabel('edit-affiliations', 'Edit Affiliations');
      config.addLabel('show-more-fields', 'More fields');
      config.addLabel('show-less-fields', 'Less fields');
      config.addLabel('multi-select-default-value', 'Click to select a value');
      config.addLabel('select-default-value', 'No value selected');

      // item types
      config.addLabel('journal-article-ref', 'Journal Article');
      config.addLabel('edit-journal-article-ref', 'Edit Journal Article');
      config.addLabel('add-journal-article-ref', 'Add Journal Article');
      config.addLabel('create-journal-article-ref', 'Create Journal Article');

      config.addLabel('book-ref', 'Book');
      config.addLabel('edit-book-ref', 'Edit Book');
      config.addLabel('add-book-ref', 'Add Book');
      config.addLabel('create-book-ref', 'Create Book');

      config.addLabel('chapter-ref', 'Chapter');
      config.addLabel('edit-chapter-ref', 'Edit Chapter');
      config.addLabel('add-chapter-ref', 'Add Chapter');
      config.addLabel('create-chapter-ref', 'Create Chapter');

      config.addLabel('conference-paper-ref', 'Conference Paper');
      config.addLabel('create-conference-paper-ref', 'Create Conference Paper');
      config.addLabel('edit-conference-paper-ref', 'Edit Conference Paper');

      config.addLabel('webpage-ref', 'Webpage');
      config.addLabel('create-webpage-ref', 'Create Webpage');
      config.addLabel('edit-webpage-ref', 'Edit Webpage');

      config.addLabel('thesis-ref', 'Thesis');
      config.addLabel('create-thesis-ref', 'Create Thesis');
      config.addLabel('edit-thesis-ref', 'Edit Thesis');

      config.addLabel('software-ref', 'Software');
      config.addLabel('create-software-ref', 'Create Software');
      config.addLabel('edit-software-ref', 'Edit Software');

      config.addLabel('report-ref', 'Report');
      config.addLabel('create-report-ref', 'Create Report');
      config.addLabel('edit-report-ref', 'Edit Report');

      config.addLabel('data-publication-ref', 'Data Publication');
      config.addLabel('create-data-publication-ref', 'Create Data Publication');
      config.addLabel('edit-data-publication-ref', 'Edit Data Publication');

      config.addLabel('magazine-article-ref', 'Magazine Article');
      config.addLabel('create-magazine-article-ref', 'Create Magazine Article');
      config.addLabel('edit-magazine-article-ref', 'Edit Magazine Article');

      config.addLabel('newspaper-article-ref', 'Newspaper Article');
      config.addLabel('create-newspaper-article-ref', 'Create Newspaper Article');
      config.addLabel('edit-newspaper-article-ref', 'Edit Newspaper Article');

      config.addLabel('patent-ref', 'Patent');
      config.addLabel('create-patent-ref', 'Create Patent');

      config.addLabel('article-ref', 'Article');
      config.addLabel('create-article-ref', 'Create Article');

      // fields labels
      config.addLabel('authors', 'Authors');
      config.addLabel('edit-authors', 'Edit Authors');

      config.addLabel('editors', 'Editors');
      config.addLabel('edit-editors', 'Edit Editors');

      config.addLabel('translators', 'Translators');
      config.addLabel('edit-translators', 'Edit Translators');

      config.addLabel('abstract', 'Main Abstract');
      config.addLabel('abstractType', 'Abstract Type');
      config.addLabel('accessedDate', 'Accessed Date');
      config.addLabel('accessionId', 'Accession ID');
      config.addLabel('archiveId', 'Archive ID');
      config.addLabel('arkId', 'ARK ID');
      config.addLabel('assignee', 'Assignee');
      config.addLabel('confLoc', 'Conference Location');
      config.addLabel('confName', 'Conference Name');
      config.addLabel('containerTitle', 'Source');
      config.addLabel('custom-abstract', 'Custom Abstract');
      config.addLabel('day', 'Day');
      config.addLabel('doi', 'DOI');
      config.addLabel('edition', 'Edition');
      config.addLabel('elocationId', 'E-Location ID');
      config.addLabel('fpage', 'First Page');
      config.addLabel('given-names', 'Given Names');
      config.addLabel('inventors', 'Inventors');
      config.addLabel('isbn', 'ISBN');
      config.addLabel('issue', 'Issue');
      config.addLabel('issue-title', 'Issue Title');
      config.addLabel('lpage', 'Last Page');
      config.addLabel('month', 'Month');
      config.addLabel('name', 'Name');
      config.addLabel('pageCount', 'Page Count');
      config.addLabel('pageRange', 'Page Range');
      config.addLabel('patentCountry', 'Patent Country');
      config.addLabel('patentNumber', 'Patent Number');
      config.addLabel('partTitle', 'Part Title');
      config.addLabel('pmid', 'PubMed ID');
      config.addLabel('publisherLoc', 'Publisher Location');
      config.addLabel('publisherName', 'Publisher Name');
      config.addLabel('source', 'Source');
      config.addLabel('sponsors', 'Sponsors');
      config.addLabel('series', 'Series');
      config.addLabel('title', 'Title');
      config.addLabel('version', 'Version');
      config.addLabel('volume', 'Volume');
      config.addLabel('year', 'Year');

      config.addLabel('acceptedDate', 'Accepted Date');
      config.addLabel('publishedDate', 'Published Date');
      config.addLabel('receivedDate', 'Received Date');
      config.addLabel('revReceivedDate', 'Revision Received Date');
      config.addLabel('revRequestedDate', 'Revision Requested Date');

      // person labels
      config.addLabel('person', 'Person');
      config.addLabel('add-person', 'Add Person');
      config.addLabel('edit-person', 'Edit Person');
      config.addLabel('create-person', 'Create Person');
      config.addLabel('orcid', 'ORCID');
      config.addLabel('givenNames', 'Given Names');
      config.addLabel('surname', 'Surname');
      config.addLabel('alias', 'Alias');
      config.addLabel('prefix', 'Prefix');
      config.addLabel('suffix', 'Suffix');
      config.addLabel('bio', 'Biography');
      config.addLabel('affiliations', 'Affiliations');
      config.addLabel('funders', 'Funders');
      config.addLabel('group', 'Group');
      config.addLabel('equalContrib', 'Equal Contribution');
      config.addLabel('corresp', 'Corresponding Author');
      config.addLabel('deceased', 'Deceased');

      // affiliation labels
      config.addLabel('affiliation', 'Affiliation');
      config.addLabel('division1', 'Division 1 (Department)');
      config.addLabel('division2', 'Division 2');
      config.addLabel('division3', 'Division 3');
      config.addLabel('street', 'Address Line 1 (Street)');
      config.addLabel('addressComplements', 'Address Line 2 (Complements)');
      config.addLabel('city', 'City');
      config.addLabel('state', 'State');
      config.addLabel('postalCode', 'Postal Code');
      config.addLabel('country', 'Country');
      config.addLabel('phone', 'Phone');
      config.addLabel('fax', 'Fax');
      config.addLabel('email', 'Email');
      config.addLabel('uri', 'Website');
      config.addLabel('members', 'Members');
      config.addLabel('edit-members', 'Edit Members');

      // award labels
      config.addLabel('funder', 'Funder');
      config.addLabel('institution', 'Institution');
      config.addLabel('fundRefId', 'Institution Identifier');
      config.addLabel('awardId', 'Award Identifier');

      // keyword labels
      config.addLabel('keyword', 'Keyword');
      config.addLabel('category', 'Category');
      config.addLabel('language', 'Language');

      // subject labels
      config.addLabel('subject', 'Subject');

      // figure labels
      config.addLabel('figure', 'Figure');
      config.addLabel('content', 'Content');
      config.addLabel('legend', 'Legend');
      config.addLabel('copyrightStatement', 'Copyright Statement');
      config.addLabel('copyrightYear', 'Copyright Year');
      config.addLabel('copyrightHolder', 'Copyright Holder');
      config.addLabel('license', 'License');
      config.addLabel('licenseText', 'License Text (optional)');

      // table figure labels
      config.addLabel('table-figure', 'Table');

      // translatable labels
      config.addLabel('translatable', 'Translation');

      // footnote labels
      config.addLabel('fn', 'Footnote');
    }
  };

  class _CardCommand extends substance.Command {
    getCommandState (params, context) {
      let appState = context.editorState;
      let sel = appState.selection;
      if (sel && sel.customType === 'card') {
        let node = appState.selectionState.node;
        if (this._canApplyCommand(context, node)) {
          return {
            disabled: false,
            nodeId: node.id,
            label: this._getLabel(context, node)
          }
        }
      }
      return { disabled: true }
    }

    _canApplyCommand (context, node) {
      throw new Error('This method is abstract')
    }

    _getLabel (context, node) {
      throw new Error('This method is abstract')
    }
  }

  class RemoveEntityCommand extends _CardCommand {
    execute (params, context) {
      let commandState = params.commandState;
      let nodeId = commandState.nodeId;
      context.api.removeEntity(nodeId);
    }

    _canApplyCommand (context, node) {
      return context.api.canRemoveEntity(node)
    }

    _getLabel (context, node) {
      let labelProvider = context.labelProvider;
      return `${labelProvider.getLabel('remove-something', { something: labelProvider.getLabel(node.type) })}`
    }
  }

  class MoveEntityUpCommand extends _CardCommand {
    execute (params, context) {
      let commandState = params.commandState;
      let nodeId = commandState.nodeId;
      context.api.moveEntityUp(nodeId);
    }

    _canApplyCommand (context, node) {
      return context.api.canMoveEntityUp(node)
    }

    _getLabel (context, node) {
      let labelProvider = context.labelProvider;
      return `${labelProvider.getLabel('move-something-up', { something: labelProvider.getLabel(node.type) })}`
    }
  }

  class MoveEntityDownCommand extends _CardCommand {
    execute (params, context) {
      let commandState = params.commandState;
      let nodeId = commandState.nodeId;
      context.api.moveEntityDown(nodeId);
    }

    _canApplyCommand (context, node) {
      return context.api.canMoveEntityDown(node)
    }

    _getLabel (context, node) {
      let labelProvider = context.labelProvider;
      return `${labelProvider.getLabel('move-something-down', { something: labelProvider.getLabel(node.type) })}`
    }
  }

  /* eslint-disable no-template-curly-in-string */
  /*import CustomAbstractComponent from './CustomAbstractComponent'*/

  var MetadataPackage = {
    name: 'metadata',
    configure (articleConfig) {
      let config = articleConfig.createSubConfiguration('metadata');

      // TODO: it would be greate to reuse config from the article toolbar.
      // However, this is problematic, because at the time of this being called
      // the article toolbar configuration might not have been finished.
      // E.g. a plugin could change it.
      let articleToolbarSpec = articleConfig._toolPanelRegistry.get('toolbar');
      config.addToolPanel('toolbar', [
        // only undo/redo, no save
        {
          name: 'document-tools',
          type: 'group',
          style: 'minimal',
          items: [
            { type: 'command', name: 'undo' },
            { type: 'command', name: 'redo' }
          ]
        },
        // inherit primary-annotations
        articleToolbarSpec.find(spec => spec.name === 'primary-annotations'),
        // only inline content and metadata content
        {
          name: 'insert',
          type: 'dropdown',
          style: 'descriptive',
          hideDisabled: true,
          alwaysVisible: true,
          items: [
            {
              name: 'metadata',
              type: 'group',
              label: 'entities',
              items: [
               /* { type: 'command', name: 'add-author', label: 'author' },
                { type: 'command', name: 'add-custom-abstract', label: 'custom-abstract' },
                { type: 'command', name: 'add-editor', label: 'editor' },
                { type: 'command', name: 'add-group', label: 'group' },
                { type: 'command', name: 'add-affiliation', label: 'affiliation' },
                { type: 'command', name: 'add-funder', label: 'funder' },
                { type: 'command', name: 'add-keyword', label: 'keyword' },
                { type: 'command', name: 'add-subject', label: 'subject' }*/
              ]
            },
            {
              name: 'inline-content',
              type: 'group',
              label: 'inline',
              items: [
                { type: 'command', name: 'insert-inline-formula', label: 'math' },
                { type: 'command', name: 'insert-inline-graphic', label: 'inline-graphic' },
                { type: 'command', name: 'create-external-link', label: 'link', icon: 'link' },
                { type: 'command', name: 'insert-xref-bibr', label: 'citation' },
                { type: 'command', name: 'insert-xref-figure', label: 'figure-reference' },
                { type: 'command', name: 'insert-xref-table', label: 'table-reference' },
                { type: 'command', name: 'insert-xref-footnote', label: 'footnote-reference' },
                { type: 'command', name: 'insert-xref-formula', label: 'equation-reference' },
                { type: 'command', name: 'insert-xref-file', label: 'file-reference' }
              ]
            }
          ]
        },
        // inherit formatting
        articleToolbarSpec.find(spec => spec.name === 'format'),
        // inherit text type switcher
        articleToolbarSpec.find(spec => spec.name === 'text-types'),
        // inherit contextual tools, but exclude the 'Edit Metadata' tool
        {
          name: 'context-tools',
          type: 'dropdown',
          style: 'descriptive',
          // hide disabled items but not the dropdown itself
          hideDisabled: true,
          alwaysVisible: true,
          items: articleToolbarSpec.find(spec => spec.name === 'context-tools').items.filter(s => s.name !== 'edit-metadata')
        }
      ]);

      config.addToolPanel('context-menu', [
        {
          name: 'context-menu',
          type: 'group',
          style: 'descriptive',
          hideDisabled: true,
          items: [
            { type: 'command-group', name: 'file' },
            { type: 'command-group', name: 'author' },
            { type: 'command-group', name: 'collection' },
            { type: 'command-group', name: 'list' },
            { type: 'command-group', name: 'metadata-fields' }
          ]
        }
      ]);

    /*  config.addComponent('article-metadata', ArticleMetadataComponent)
      config.addComponent('article-information', ArticleInformationSectionComponent)
      config.addComponent(CustomAbstract.type, CustomAbstractComponent)
      config.addComponent('@abstracts', AbstractsSectionComponent)

      config.addCommand('add-author', AddAuthorCommand)
      config.addCommand('add-affiliation', AddAffiliationCommand)
      config.addCommand('add-custom-abstract', AddCustomAbstractCommand)
      config.addCommand('add-editor', AddEditorCommand)
      config.addCommand('add-group', AddGroupCommand)
      config.addCommand('add-funder', AddFunderCommand)
      config.addCommand('add-keyword', AddKeywordCommand)
      config.addCommand('add-subject', AddSubjectCommand)
  */
      config.addCommand('remove-entity', RemoveEntityCommand, {
        commandGroup: 'collection'
      });
      config.addCommand('move-entity-down', MoveEntityDownCommand, {
        commandGroup: 'collection'
      });
      config.addCommand('move-entity-up', MoveEntityUpCommand, {
        commandGroup: 'collection'
      });

    /*  config.addLabel('abstracts', 'Abstracts')
      config.addLabel('article-information', 'Article Information')
      config.addLabel('article-metadata', 'Article Metadata')
      config.addLabel('entities', 'Entities')
      config.addLabel('groups', 'Groups')
      config.addLabel('issueTitle', 'Issue Title')
      config.addLabel('keywords', 'Keywords')
      config.addLabel('affiliations', 'Affiliations')*/
      config.addLabel('references', 'References');
      // TODO: provide a means to override the label via commandState,
      // i.e. the command itself stores the desired lable in commandState.label
      config.addLabel('remove-entity', '${label}'); // NOTE: the command itself has to provide 'label' via commandState
      config.addLabel('move-entity-down', '${label}'); // NOTE: the command itself has to provide 'label' via commandState
      config.addLabel('move-entity-up', '${label}'); // NOTE: the command itself has to provide 'label' via commandState
      config.addLabel('remove-something', 'Remove ${something}');
      config.addLabel('move-something-down', 'Move ${something} down');
      config.addLabel('move-something-up', 'Move ${something} up');
      /*config.addLabel('subjects', 'Subjects')*/

      config.addIcon('checked-item', { 'fontawesome': 'fa-check-square-o' });
      config.addIcon('unchecked-item', { 'fontawesome': 'fa-square-o' });
      config.addIcon('remove', { 'fontawesome': 'fa-trash' });
    }
  };

  class BodyConverter extends SectionContainerConverter {
    get type () { return 'body' }

    get tagName () { return 'body' }
  }

  class BoldConverter$1 {
    get type () { return 'bold' }

    get tagName () { return 'bold' }
  }

  // ATTENTION: ATM we only allow content-type 'math/tex'
  class BlockFormulaConverter {
    get type () { return 'block-formula' }

    get tagName () { return 'disp-formula' }

    import (el, node, importer) {
      let labelEl = findChild(el, 'label');
      let contentType = el.attr('content-type');
      if (contentType && contentType !== 'math/tex') {
        throw new Error('Only content-type="math/tex" is supported.')
      }
      let contentEl = this._getContent(el);
      if (labelEl) {
        node.label = labelEl.text();
      }
      if (contentEl) {
        node.content = substance.DefaultDOMElement.parseSnippet(contentEl.getInnerXML(), 'xml').getTextContent();
      }
    }

    _getContent (el) {
      return findChild(el, 'tex-math')
    }

    export (node, el, exporter) {
      let $$ = exporter.$$;

      // Note: ATM only math/tex is supported and thus hard-coded here
      el.attr('content-type', 'math/tex');

      let label = getLabel(node);
      if (label) {
        el.append($$('label').text(label));
      }
      if (node.content) {
        const texMath = $$('tex-math');
        texMath.append(texMath.createCDATASection(node.content));
        el.append(
          texMath
        );
      }
    }
  }

  /**
   * A converter for JATS `<disp-quote>`.
   * Our internal model deviates from the original one in that the the attribution is separated from
   * the quote content by using a dedicated text property 'attrib'
   */
  class BlockQuoteConverter {
    get type () { return 'block-quote' }

    get tagName () { return 'disp-quote' }

    import (el, node, importer) {
      let $$ = el.createElement.bind(el.getOwnerDocument());
      let pEls = findAllChildren(el, 'p');
      if (pEls.length === 0) {
        pEls.push($$('p'));
      }
      let attrib = findChild(el, 'attrib');
      if (attrib) {
        node.attrib = importer.annotatedText(attrib, [node.id, 'attrib']);
      }
      node.content = pEls.map(p => {
        return importer.convertElement(p).id
      });
    }

    export (node, el, exporter) {
      let $$ = exporter.$$;
      let content = node.resolve('content');
      el.append(
        content.map(p => {
          return exporter.convertNode(p)
        })
      );
      if (node.attrib) {
        el.append(
          $$('attrib').append(
            exporter.annotatedText([node.id, 'attrib'])
          )
        );
      }
    }
  }

  class BreakConverter {
    get type () { return 'break' }

    get tagName () { return 'break' }
  }

  class FigurePanelConverter {
    get type () { return 'figure-panel' }

    // ATTENTION: figure-panel is represented in JATS
    // instead there is the distinction between fig-group and fig
    // which are represented as Figure in Texture
    get tagName () { return 'fig' }

    import (el, node, importer) {
      let $$ = el.createElement.bind(el.getOwnerDocument());
      let labelEl = findChild(el, 'label');
      let contentEl = this._getContent(el);
      let permissionsEl = findChild(el, 'permissions');
      let captionEl = findChild(el, 'caption');
      let doc = importer.getDocument();
      // Preparations
      if (!captionEl) {
        captionEl = $$('caption');
      }
      let titleEl = findChild(captionEl, 'title');
      if (!titleEl) {
        titleEl = $$('title');
      }
      // drop everything than 'p' from caption
      retainChildren(captionEl, 'p');
      // there must be at least one paragraph
      if (!captionEl.find('p')) {
        captionEl.append($$('p'));
      }
      // EXPERIMENTAL: supporting <supplementary-material> in figure caption
      // in JATS this requires a HACK, wrapping <supplementary-material> into a <p>
      // this implementation is prototypal, i.e. has not been signed off commonly
      this._unwrapDisplayElements(captionEl);

      // Conversion
      if (labelEl) {
        node.label = labelEl.text();
      }
      node.title = importer.annotatedText(titleEl, [node.id, 'title']);
      // content is optional
      // TODO: really?
      if (contentEl) {
        node.content = importer.convertElement(contentEl).id;
      }
      // Note: we are transforming capton content to legend property
      node.legend = captionEl.children.map(child => importer.convertElement(child).id);
      if (permissionsEl) {
        node.permission = importer.convertElement(permissionsEl).id;
      } else {
        node.permission = doc.create({ type: 'permission' }).id;
      }

      // Custom Metadata Fields
      let kwdGroupEls = el.findAll('kwd-group');
      node.metadata = kwdGroupEls.map(kwdGroupEl => {
        let kwdEls = kwdGroupEl.findAll('kwd');
        let labelEl = kwdGroupEl.find('label');
        let name = labelEl ? labelEl.textContent : '';
        let value = kwdEls.map(kwdEl => kwdEl.textContent).join(', ');
        return doc.create({
          type: MetadataField.type,
          name,
          value
        }).id
      });
    }

    _getContent (el) {
      return findChild(el, 'graphic')
    }

    export (node, el, exporter) {
      let $$ = exporter.$$;
      // ATTENTION: this helper retrieves the label from the state
      let label = getLabel(node);
      if (label) {
        el.append($$('label').text(label));
      }
      // Attention: <title> is part of the <caption>
      // Note: we are transforming the content of legend to <caption>
      if (node.title || node.legend) {
        let content = node.resolve('legend');
        let captionEl = $$('caption');
        if (content.length > 0) {
          captionEl.append(
            content.map(p => exporter.convertNode(p))
          );
        }
        if (node.title) {
          // Note: this would happen if title is set, but no caption
          if (!captionEl) captionEl = $$('caption');
          // ATTENTION: wrapping display elements into a <p>
          // Do this before injecting the title
          this._wrapDisplayElements(captionEl);
          captionEl.insertAt(0,
            $$('title').append(
              exporter.annotatedText([node.id, 'title'])
            )
          );
        }
        el.append(captionEl);
      }
      // Custom Metadata Fields
      if (node.metadata.length > 0) {
        let kwdGroupEls = node.resolve('metadata').map(field => {
          let kwdGroupEl = $$('kwd-group').append(
            $$('label').text(field.name)
          );
          let kwdEls = field.value.split(',').map(str => {
            return $$('kwd').text(str.trim())
          });
          kwdGroupEl.append(kwdEls);
          return kwdGroupEl
        });
        el.append(kwdGroupEls);
      }
      if (node.content) {
        el.append(
          exporter.convertNode(node.resolve('content'))
        );
      }
      let permission = node.resolve('permission');
      if (permission && !permission.isEmpty()) {
        el.append(
          exporter.convertNode(permission)
        );
      }
    }

    // EXPERIMENTAL see comment above
    _unwrapDisplayElements (el) {
      let children = el.getChildren();
      let L = children.length;
      for (let i = L - 1; i >= 0; i--) {
        let child = children[i];
        if (child.is('p[specific-use="display-element-wrapper"]')) {
          let children = child.getChildren();
          if (children.length === 1) {
            el.replaceChild(child, children[0]);
          } else {
            console.error('Expecting a single element wrapped in <p>');
          }
        }
      }
    }

    _wrapDisplayElements (el) {
      let children = el.getChildren();
      let L = children.length;
      for (let i = L - 1; i >= 0; i--) {
        let child = children[i];
        if (!child.is('p')) {
          let p = el.createElement('p').attr('specific-use', 'display-element-wrapper').append(child.clone(true));
          el.replaceChild(child, p);
        }
      }
    }
  }

  class FigureConverter {
    get type () { return 'figure' }

    // ATTENTION: this converter will create either a <fig> or a <fig-group>
    // element depending on the number of Figure panels
    get tagName () { return 'figure' }

    matchElement (el, importer) {
      if (el.is('fig') || el.is('fig-group')) {
        // Note: do not use this converter if we are already converting a figure
        let context = importer.state.getCurrentContext();
        // Note: no context is given if the importer is used stand-alone
        return !context || context.converter !== this
      } else {
        return false
      }
    }

    import (el, node, importer) {
      // single panel figure
      let panelIds = [];
      if (el.is('fig')) {
        // HACK: unfortunately the importer reserves the original id
        // but we would like to use it for the first panel
        let figPanelConverter = new FigurePanelConverter();
        let figPanelData = { type: 'figure-panel', id: node.id };
        figPanelConverter.import(el, figPanelData, importer);
        importer._createNode(figPanelData);
        return {
          type: 'figure',
          id: importer.nextId('fig'),
          panels: [figPanelData.id]
        }
      // multi-panel figure
      } else if (el.is('fig-group')) {
        panelIds = el.findAll('fig').map(child => importer.convertElement(child).id);
      }
      node.panels = panelIds;
    }

    export (node, el, exporter) {
      let doc = exporter.getDocument();
      if (node.panels.length === 1) {
        return exporter.convertNode(doc.get(node.panels[0]))
      } else {
        el.tagName = 'fig-group';
        el.attr('id', node.id);
        el.append(node.panels.map(id => exporter.convertNode(doc.get(id))));
        return el
      }
    }
  }

  // TODO: at some point we want to retain the label and determine if the label should be treated as custom
  // or be generated.
  class FootnoteConverter {
    get type () { return 'footnote' }

    get tagName () { return 'fn' }

    // NOTE: we don’t support custom labels at the moment, so we will ignore input from fn > label
    import (el, node, importer) {
      let pEls = findAllChildren(el, 'p');
      node.content = pEls.map(el => importer.convertElement(el).id);
    }

    export (node, el, exporter) {
      const $$ = exporter.$$;
      // We gonna need to find another way for node states. I.e. for labels we will have
      // a hybrid scenario where the labels are either edited manually, and thus we need to record ops,
      // or they are generated without persisting operations (e.g. think about undo/redo, or collab)
      // my suggestion would be to introduce volatile ops, they would be excluded from the DocumentChange, that is stored in the change history,
      // or used for collaborative editing.
      let label = getLabel(node);
      if (label) {
        el.append(
          $$('label').text(label)
        );
      }
      el.append(
        node.resolve('content').map(p => exporter.convertNode(p))
      );
    }
  }

  class ElementCitationConverter {
    // Note: this will create different types according to the attributes in the JATS element
    get type () { return 'reference' }

    matchElement (el) {
      return el.is('ref')
    }

    import (el, node, importer) {
      const doc = importer.state.doc;
      let elementCitation = el.find('element-citation');
      if (!elementCitation) {
        let mixedCitation = el.find('mixed-citation');
          _importMixedCitation(mixedCitation, node, doc, importer);
        if (!mixedCitation) {
         throw new Error('<element-citation> or <mixed-citation> is required')
        }
      }
      else {
        _importElementCitation(elementCitation, node, doc, importer);
      }


    }

    export (node, el, exporter) {
      el.tagName = 'ref';
      el.append(
        _exportElementCitation(node, exporter)
      );
      return el
    }
  }

  function _importMixedCitation (el, node, doc, importer) {
    const type = el.attr('publication-type');
    node.type = JATS_BIBR_TYPES_TO_INTERNAL[type];
    //_setCitationObjects(node, el);
    node.title = el.getOuterHTML().toString();
  }

  function _setCitationObjects(node, el) {
    Object.assign(node, {
      assignee: getText(el, 'collab[collab-type=assignee] > named-content'),
      confName: getText(el, 'conf-name'),
      confLoc: getText(el, 'conf-loc'),
      day: getText(el, 'day'),
      edition: getText(el, 'edition'),
      elocationId: getText(el, 'elocation-id'),
      fpage: getText(el, 'fpage'),
      issue: getText(el, 'issue'),
      lpage: getText(el, 'lpage'),
      month: getText(el, 'month'),
      pageCount: getText(el, 'page-count'),
      pageRange: getText(el, 'page-range'),
      partTitle: getText(el, 'part-title'),
      patentCountry: getAttr(el, 'patent', 'country'),
      patentNumber: getText(el, 'patent'),
      publisherLoc: getSeparatedText(el, 'publisher-loc'),
      publisherName: getSeparatedText(el, 'publisher-name'),
      series: getText(el, 'series'),
      uri: getText(el, 'uri'),
      version: getText(el, 'version'),
      volume: getText(el, 'volume'),
      year: getText(el, 'year'),
      accessedDate: getAttr(el, 'date-in-citation', 'iso-8601-date'),
      // identifiers
      accessionId: getText(el, 'pub-id[pub-id-type=accession]'),
      archiveId: getText(el, 'pub-id[pub-id-type=archive]'),
      arkId: getText(el, 'pub-id[pub-id-type=ark]'),
      isbn: getText(el, 'pub-id[pub-id-type=isbn]'),
      doi: getText(el, 'pub-id[pub-id-type=doi]'),
      pmid: getText(el, 'pub-id[pub-id-type=pmid]')
    });
  }

  function _importElementCitation (el, node, doc, importer) {
    const type = el.attr('publication-type');
    node.type = JATS_BIBR_TYPES_TO_INTERNAL[type];
    _setCitationObjects(node, el);

    if (type === 'book' || type === 'report' || type === 'software') {
      node.title = getAnnotatedText(importer, el, 'source', [node.id, 'title']);
    } else {
      node.containerTitle = getText(el, 'source');
      if (type === 'chapter') {
        node.title = getAnnotatedText(importer, el, 'chapter-title', [node.id, 'title']);
      } else if (type === 'data') {
        node.title = getAnnotatedText(importer, el, 'data-title', [node.id, 'title']);
      } else {
        node.title = getAnnotatedText(importer, el, 'article-title', [node.id, 'title']);
      }
    }

    node.authors = _importPersonGroup(el, doc, 'author');
    node.editors = _importPersonGroup(el, doc, 'editor');
    node.inventors = _importPersonGroup(el, doc, 'inventor');
    node.sponsors = _importPersonGroup(el, doc, 'sponsor');
    node.translators = _importPersonGroup(el, doc, 'translator');
  }

  function getAnnotatedText (importer, rootEl, selector, path) {
    let el = rootEl.find(selector);
    if (el) {
      return importer.annotatedText(el, path)
    } else {
      return ''
    }
  }

  function _importPersonGroup (el, doc, type) {
    let groupEl = el.find(`person-group[person-group-type=${type}]`);
    if (groupEl) {
      return groupEl.children.reduce((ids, childEl) => {
        let refContrib = _importRefContrib(doc, childEl);
        if (refContrib) ids.push(refContrib.id);
        return ids
      }, [])
    } else {
      return []
    }
  }

  function _importRefContrib (doc, el) {
    let refContrib = {
      type: 'ref-contrib'
    };
    if (el.tagName === 'name') {
      refContrib.givenNames = getText(el, 'given-names');
      refContrib.name = getText(el, 'surname');
      // TODO: We may want to consider prefix postfix, and mix it into givenNames, or name properties
      // We don't want separate fields because this gets complex/annoying during editing
      // prefix: getText(el, 'prefix'),
      // suffix: getText(el, 'suffix'),
    } else if (el.tagName === 'collab') {
      refContrib.name = getText(el, 'named-content[content-type=name]');
    } else {
      console.warn(`${el.tagName} not supported inside <person-group>`);
      return null
    }
    return doc.create(refContrib)
  }

  function _exportElementCitation (node, exporter) {
    const $$ = exporter.$$;
    const doc = node.getDocument();
    const type = node.type;
    let el = $$('element-citation').attr('publication-type', INTERNAL_BIBR_TYPES_TO_JATS[type]);
    if (node.assignee) {
      el.append(
        $$('collab').attr('collab-type', 'assignee').append(
          $$('named-content').attr({ 'content-type': 'name' }).text(node.assignee)
        )
      );
    }
    el.append(_createTextElement$1($$, node.confName, 'conf-name'));
    el.append(_createTextElement$1($$, node.confLoc, 'conf-loc'));
    el.append(_createTextElement$1($$, node.day, 'day'));
    el.append(_createTextElement$1($$, node.edition, 'edition'));
    el.append(_createTextElement$1($$, node.elocationId, 'elocation-id'));
    el.append(_createTextElement$1($$, node.fpage, 'fpage'));
    el.append(_createTextElement$1($$, node.issue, 'issue'));
    el.append(_createTextElement$1($$, node.lpage, 'lpage'));
    el.append(_createTextElement$1($$, node.month, 'month'));
    el.append(_createTextElement$1($$, node.pageCount, 'page-count'));
    el.append(_createTextElement$1($$, node.pageRange, 'page-range'));
    el.append(_createTextElement$1($$, node.partTitle, 'part-title'));
    el.append(_createTextElement$1($$, node.patentNumber, 'patent', { 'country': node.patentCountry }));
    el.append(_createMultipleTextElements($$, node.publisherLoc, 'publisher-loc'));
    el.append(_createMultipleTextElements($$, node.publisherName, 'publisher-name'));
    el.append(_createTextElement$1($$, node.uri, 'uri'));
    el.append(_createTextElement$1($$, node.accessedDate, 'date-in-citation', { 'iso-8601-date': node.accessedDate }));
    el.append(_createTextElement$1($$, node.version, 'version'));
    el.append(_createTextElement$1($$, node.volume, 'volume'));
    el.append(_createTextElement$1($$, node.year, 'year'));
    // identifiers
    el.append(_createTextElement$1($$, node.accessionId, 'pub-id', { 'pub-id-type': 'accession' }));
    el.append(_createTextElement$1($$, node.arkId, 'pub-id', { 'pub-id-type': 'ark' }));
    el.append(_createTextElement$1($$, node.archiveId, 'pub-id', { 'pub-id-type': 'archive' }));
    el.append(_createTextElement$1($$, node.isbn, 'pub-id', { 'pub-id-type': 'isbn' }));
    el.append(_createTextElement$1($$, node.doi, 'pub-id', { 'pub-id-type': 'doi' }));
    el.append(_createTextElement$1($$, node.pmid, 'pub-id', { 'pub-id-type': 'pmid' }));
    // creators
    el.append(_exportPersonGroup($$, doc, node.authors, 'author'));
    el.append(_exportPersonGroup($$, doc, node.editors, 'editor'));
    el.append(_exportPersonGroup($$, doc, node.inventors, 'inventor'));
    el.append(_exportPersonGroup($$, doc, node.sponsors, 'sponsor'));

    if (type === BOOK_REF || type === REPORT_REF || type === SOFTWARE_REF) {
      el.append(_exportAnnotatedText$1(exporter, [node.id, 'title'], 'source'));
    } else {
      el.append(_createTextElement$1($$, node.containerTitle, 'source'));
      if (type === CHAPTER_REF) {
        el.append(
          _exportAnnotatedText$1(exporter, [node.id, 'title'], 'chapter-title')
        );
      } else if (type === DATA_PUBLICATION_REF) {
        el.append(
          _exportAnnotatedText$1(exporter, [node.id, 'title'], 'data-title')
        );
      } else {
        el.append(
          _exportAnnotatedText$1(exporter, [node.id, 'title'], 'article-title')
        );
      }
    }
    return el
  }

  function _exportPersonGroup ($$, doc, contribIds, personGroupType) {
    if (contribIds && contribIds.length > 0) {
      let el = $$('person-group').attr('person-group-type', personGroupType);
      contribIds.forEach(id => {
        let refContribNode = doc.get(id);
        el.append(
          _exportRefContrib($$, refContribNode)
        );
      });
      return el
    }
  }

  function _exportRefContrib ($$, refContrib) {
    let el;
    if (refContrib.givenNames) {
      el = $$('name');
      el.append(_createTextElement$1($$, refContrib.name, 'surname'));
      el.append(_createTextElement$1($$, refContrib.givenNames, 'given-names'));
    } else if (refContrib.name) {
      el = $$('collab');
      el.append(_createTextElement$1($$, refContrib.name, 'named-content', { 'content-type': 'name' }));
    } else {
      console.warn('No content found for refContrib node');
    }
    return el
  }

  function _createTextElement$1 ($$, text, tagName, attrs) {
    if (text) {
      return $$(tagName).append(text).attr(attrs)
    }
  }

  function _exportAnnotatedText$1 (exporter, path, tagName, attrs) {
    const $$ = exporter.$$;
    let text = exporter.getDocument().get(path);
    if (text) {
      return $$(tagName).attr(attrs).append(
        exporter.annotatedText(path)
      )
    }
  }

  function _createMultipleTextElements ($$, text, tagName, attrs) {
    if (text) {
      const textItems = text.split(';');
      return textItems.map(ti => {
        return $$(tagName).append(ti.trim()).attr(attrs)
      })
    }
  }

  class ExternalLinkConverter {
    get type () { return 'external-link' }
    get tagName () { return 'ext-link' }

    import (el, node) {
      let extLinkType = el.getAttribute('ext-link-type');
      if (extLinkType) {
        node.linkType = extLinkType;
      }
      let href = el.getAttribute('xlink:href');
      if (href) {
        node.href = href;
      }
    }
    export (node, el) {
      if (node.linkType) {
        el.setAttribute('ext-link-type', node.linkType);
      }
      if (node.href) {
        el.setAttribute('xlink:href', node.href);
      }
    }
  }

  class GraphicConverter {
    get type () { return 'graphic' }

    get tagName () { return 'graphic' }

    import (el, node) {
      node.mimeType = [el.attr('mimetype'), el.attr('mime-subtype')].join('/');
      node.href = el.attr('xlink:href');
    }

    export (node, el) {
      let mimeData = node.mimeType.split('/');
      el.attr('mimetype', mimeData[0]);
      el.attr('mime-subtype', mimeData[1]);
      el.attr('xlink:href', node.href);
    }
  }

  class HeadingImporter {
    get type () { return 'heading' }
    get tagName () { return 'heading' }
    import (el, node, importer) {
      // Note: attributes are converted automatically
      node.level = parseInt(node.attributes.level, 10);
      node.content = importer.annotatedText(el, [node.id, 'content']);
    }
  }

  class InlineFormulaConverter extends BlockFormulaConverter {
    get type () { return 'inline-formula' }

    get tagName () { return 'inline-formula' }
  }

  class InlineGraphicConverter extends GraphicConverter {
    get type () { return 'inline-graphic' }

    get tagName () { return 'inline-graphic' }
  }

  class ItalicConverter$1 {
    get type () { return 'italic' }

    get tagName () { return 'italic' }
  }

  class MonospaceConverter {
    get type () { return 'monospace' }

    get tagName () { return 'monospace' }
  }

  // TODO: is it possible to assimilate this implementation to '../html/ListConverter'?
  // obviously HTML lists are different w.r.t. to tagNames
  // but very similar to JATS w.r.t. the content
  class ListConverter$1 {
    get type () { return 'list' }

    get tagName () { return 'list' }

    import (el, node, importer) {
      let doc = importer.getDocument();
      let visited = new Set();
      let items = [];
      let config = [];
      this._extractItems(el, config, items, 0, visited);
      // create items
      let itemIds = items.map(item => {
        let { el, level } = item;
        let li = doc.create({
          type: 'list-item',
          id: el.id,
          level: parseInt(level, 10)
        });
        let p = el.find('p');
        if (p) {
          li.content = importer.annotatedText(p, [li.id, 'content']);
          return li.id
        }
        return false
      }).filter(Boolean);
      // populate list
      node.id = el.id;
      node.listType = config.join(',');
      node.items = itemIds;
    }

    _extractItems (el, config, items, level, visited) {
      if (el.is('list-item')) items.push({ el, level });
      if (el.is('list')) {
        let listType = el.attr('list-type') || 'bullet';
        if (!config[level]) config[level] = listType;
        level++;
        visited.add(el);
      }
      el.getChildren().forEach(c => this._extractItems(c, config, items, level, visited));
    }

    // ATTENTION: this is pretty rudimentary still
    export (node, el, exporter) {
      const $$ = exporter.$$;
      let newList = substance.renderListNode(node, (arg) => {
        if (arg === 'ol') {
          return $$('list').attr('list-type', 'order')
        } else if (arg === 'ul') {
          return $$('list').attr('list-type', 'bullet')
        } else if (arg === 'li') {
          return $$('list-item')
        } else {
          let listItem = arg;
          return $$('list-item', { id: arg.id }).append(
            $$('p').append(
              exporter.annotatedText(listItem.getPath())
            )
          )
        }
      });
      newList.id = node.id;
      return newList
    }
  }

  class OverlineConverter {
    get type () { return 'overline' }

    get tagName () { return 'overline' }
  }

  /**
   * A converter for JATS `<p>`.
   */
  class ParagraphConverter$1 {
    get type () { return 'paragraph' }

    get tagName () { return 'p' }

    import (el, node, importer) {
      node.content = importer.annotatedText(el, [node.id, 'content']);
    }

    export (node, el, exporter) {
      el.append(exporter.annotatedText([node.id, 'content']));
    }
  }

  class PermissionsConverter {
    get type () { return 'permission' }

    get tagName () { return 'permissions' }

    import (el, node, importer) {
      // Extract figure permissions
      let copyrightStatementEl = el.find('copyright-statement');
      if (copyrightStatementEl) {
        node.copyrightStatement = copyrightStatementEl.textContent;
      }
      let copyrightYearEl = el.find('copyright-year');
      if (copyrightYearEl) {
        node.copyrightYear = copyrightYearEl.textContent;
      }
      let copyrightHolderEl = el.find('copyright-holder');
      if (copyrightHolderEl) {
        node.copyrightHolder = copyrightHolderEl.textContent;
      }
      // TODO: it would be more natural and explicit to do el.find('ali:license-rec')
      let licenseRefEl = el.find('license_ref');
      if (licenseRefEl) {
        node.license = licenseRefEl.textContent;
      }
      let licenseP = el.find('license > license-p');
      if (licenseP) {
        node.licenseText = importer.annotatedText(licenseP, [node.id, 'licenseText']);
      }
    }

    export (node, el, exporter) {
      let $$ = exporter.$$;
      if (node.copyrightStatement) {
        el.append($$('copyright-statement').append(node.copyrightStatement));
      }
      if (node.copyrightYear) {
        el.append($$('copyright-year').append(node.copyrightYear));
      }
      if (node.copyrightHolder) {
        el.append($$('copyright-holder').append(node.copyrightHolder));
      }
      if (node.license || node.licenseText) {
        let licenseEl = $$('license');
        if (node.license) {
          licenseEl.append(
            $$('ali:license_ref').append(node.license)
          );
        }
        if (node.licenseText) {
          licenseEl.append(
            $$('license-p').append(
              exporter.annotatedText([node.id, 'licenseText'])
            )
          );
        }
        el.append(licenseEl);
      }
    }
  }

  class PreformatConverter$1 {
    get type () { return 'preformat' }

    get tagName () { return 'preformat' }

    import (el, node, importer) {
      let xml = el.getInnerXML();
      node.preformatType = el.getAttribute('preformat-type') || 'code';
      // ATTENTION: trimming the content to avoid extra TEXTNODES
      xml = xml.trim();
      let snippet = substance.DefaultDOMElement.parseSnippet(xml, 'xml');
      let content = snippet.getTextContent();
      node.content = content || '';
    }

    export (node, el, exporter) {
      if (node.preformatType) {
        el.setAttribute('preformat-type', node.preformatType);
      }

      if (node.content) {
        // ATTENTION: on export we always create CDATA for sake of simplicity
        // otherwise we woul need to detect if the content contained certain characters (such as '<>')
        el.append(el.createCDATASection(node.content));
      }
    }
  }

  class SmallCapsConverter {
    get type () { return 'small-caps' }

    get tagName () { return 'sc' }
  }

  class StrikeThroughConverter {
    get type () { return 'strike-through' }

    get tagName () { return 'strike' }
  }

  class SubscriptConverter {
    get type () { return 'subscript' }

    get tagName () { return 'sub' }
  }

  class SuperscriptConverter {
    get type () { return 'superscript' }

    get tagName () { return 'sup' }
  }

  class SupplementaryFileConverter {
    get type () { return 'supplementary-file' }

    get tagName () { return 'supplementary-material' }

    import (el, node, importer) {
      let $$ = el.createElement.bind(el.getOwnerDocument());
      let labelEl = findChild(el, 'label');
      let captionEl = findChild(el, 'caption');
      // create a new caption element
      if (!captionEl) {
        captionEl = $$('caption');
      }
      // there must be at least one paragraph
      if (!captionEl.find('p')) {
        captionEl.append($$('p'));
      }
      // drop everything than 'p' from caption
      // TODO: we need contextual RNG restriction for captions
      // otherwise we do not know the exact content of a caption
      retainChildren(captionEl, 'p');
      if (captionEl.getChildCount() === 0) {
        captionEl.append($$('p'));
      }
      if (labelEl) {
        node.label = labelEl.text();
      }
      node.href = el.getAttribute('xlink:href');
      node.remote = _isRemoteFile(node.href);
      let mimetype = el.getAttribute('mimetype');
      let mimeSubtype = el.getAttribute('mime-subtype');
      if (mimetype || mimeSubtype) {
        node.mimetype = [mimetype, mimeSubtype].filter(Boolean).join('/');
      }
      node.legend = captionEl.children.map(child => importer.convertElement(child).id);
    }

    export (node, el, exporter) {
      let $$ = exporter.$$;
      if (node.mimetype) {
        let mimeData = node.mimetype.split('/');
        if (mimeData[0]) {
          el.attr({
            'mimetype': mimeData[0]
          });
        }
        if (mimeData[1]) {
          el.attr({
            'mime-subtype': mimeData[1]
          });
        }
      }
      el.attr({
        'xlink:href': node.href
      });
      let label = getLabel(node);
      if (label) {
        el.append($$('label').text(label));
      }
      if (node.legend && node.legend.length > 0) {
        el.append(
          $$('caption').append(
            node.resolve('legend').map(p => {
              return exporter.convertNode(p)
            })
          )
        );
      }
    }
  }

  function _isRemoteFile (href) {
    return Boolean(/^\w+:\/\//.exec(href))
  }

  class TableFigureConverter extends FigurePanelConverter {
    get type () { return 'table-figure' }

    get tagName () { return 'table-wrap' }

    import (el, node, importer) {
      super.import(el, node, importer);

      const $$ = el.createElement.bind(el.getOwnerDocument());
      // table-wrap-foot is optional
      const tableWrapFoot = findChild(el, 'table-wrap-foot');
      if (tableWrapFoot) {
        // fn-group is optional
        const fnGroup = findChild(tableWrapFoot, 'fn-group');
        if (fnGroup) {
          let fnEls = fnGroup.findAll('fn');
          node.footnotes = fnEls.map(fnEl => {
            // there must be at least one paragraph
            if (!fnEl.find('p')) {
              fnEl.append($$('p'));
            }
            return importer.convertElement(fnEl).id
          });
        }
      }
    }

    export (node, el, exporter) {
      const $$ = exporter.$$;
      // TODO: if we decide to store attrib and permissions inside the table-wrap-foot
      // then we should not call super here, because <fig> does not have a footer
      el = super.export(node, el, exporter) || el;

      if (node.hasFootnotes()) {
        // export in the same order as displayed
        let footnotes = node.getFootnoteManager().getSortedCitables();
        let tableWrapFoot = $$('table-wrap-foot').append(
          $$('fn-group').append(
            footnotes.map(fn => exporter.convertNode(fn))
          )
        );
        el.append(tableWrapFoot);
      }
    }

    _getContent (el) {
      return findChild(el, 'table')
    }
  }

  class UnderlineConverter$1 {
    get type () { return 'underline' }

    get tagName () { return 'underline' }
  }

  class XrefConverter {
    get type () { return 'xref' }

    get tagName () { return 'xref' }

    import (el, node) {
      node.refType = el.attr('ref-type');
      node.refTargets = (el.attr('rid') || '').split(/\s/);
    }

    export (node, el, exporter) {
      el.attr('ref-type', node.refType);
      el.attr('rid', node.refTargets.join(' '));
      let label = getLabel(node);
      if (label) {
        el.text(label);
      }
    }
  }

  var ArticleJATSConverters = [
    new BodyConverter(),
    new BoldConverter$1(),
    new BlockFormulaConverter(),
    new BlockQuoteConverter(),
    new BreakConverter(),
    new ExternalLinkConverter(),
    new FigureConverter(),
    new FigurePanelConverter(),
    new FootnoteConverter(),
    new GraphicConverter(),
    new HeadingImporter(),
    new ElementCitationConverter(),
    new InlineFormulaConverter(),
    new InlineGraphicConverter(),
    new ItalicConverter$1(),
    new MonospaceConverter(),
    new ListConverter$1(),
    new OverlineConverter(),
    new ParagraphConverter$1(),
    new PermissionsConverter(),
    new PreformatConverter$1(),
    new SmallCapsConverter(),
    new StrikeThroughConverter(),
    new SubscriptConverter(),
    new SuperscriptConverter(),
    new SupplementaryFileConverter(),
    new TableConverter(),
    new TableFigureConverter(),
    new UnderlineConverter$1(),
    UnsupportedNodeConverter,
    UnsupportedInlineNodeConverter,
    new XrefConverter()
  ];

  class ArticlePlainTextExporter {
    export (article) {
      console.error('TODO: implement full article to plain-text conversion');
    }

    exportNode (node) {
      if (node.isContainer()) {
        return this._exportContainer(node)
      } else if (node.isText()) {
        return this._exportText(node.getDocument(), node.getPath())
      }
      return ''
    }

    _exportContainer (node) {
      if (!node) return ''
      return node.getNodes().map(node => {
        return this.exportNode(node)
      }).join('\n\n')
    }

    _exportText (doc, path) {
      return doc.get(path) || ''
    }
  }

  /*
    Normalize footnotes contents.
    Removes everything except textual paragraphs from footnotes.

    TODO: there are similar contexts, such as figure legends for instance.
  */
  class NormalizeFn {
    import (dom) {
      let fns = dom.findAll('fn');
      fns.forEach(fn => {
        // Find all ptags that are nested in another p tag
        let ptags = fn.findAll('p p');
        // If any nested paragraphs are found we need to take action
        if (ptags.length > 0) {
          fn.empty();
          fn.append(ptags);
        }
      });
    }

    export () {
      // nothing
    }
  }

  /*
    Ensures the first contrib-group is tagged as authors and second as editors.

    FIXME: this is an arbitrary choice and should not be done this way.
    Instead, come up with a clearer specification and find a general solution
    for this transformation.
  */
  class NormalizeContribGroup {
    import (dom) {
      let contribGroups = dom.findAll('article-meta > contrib-group');
      if (contribGroups[0]) {
        _normalizeContribGroup(contribGroups[0], 'author');
      }
      if (contribGroups[1]) {
        _normalizeContribGroup(contribGroups[1], 'editor');
      }
      if (contribGroups.length > 2) {
        console.warn(`Only the first 2 found contrib-groups (authors, editors) will be editable.`);
      }
    }

    export () {
      // nothing
    }
  }

  function _normalizeContribGroup (contribGroup, targetType) {
    contribGroup.attr('content-type', targetType);
  }

  /*
    This pulls block-elements such as `<fig>` which are
    wrapped in a `<p>` one level up.
    In the opposite direction only those elements are wrapped
    which would otherwise violate JATS
  */
  class UnwrapBlockLevelElements {
    import (dom) {
      dom.findAll('body > p').forEach(_pBlock);
    }

    export () {}
  }

  // TODO: add all of them
  const BLOCKS = ['fig', 'fig-group', 'media', 'list', 'disp-formula', 'disp-quote'];
  const isBlock = BLOCKS.reduce((m, n) => { m[n] = true; return m }, {});

  function _pBlock (p) {
    let parent = p.parentNode;
    let children = p.children;
    let L = children.length;
    let hasChanged = false;
    // doing it reverse so that we don't miss elements due to the ongoing tranformations
    for (var i = L - 1; i >= 0; i--) {
      let child = children[i];
      if (isBlock[child.tagName]) {
        hasChanged = true;
        // create a new <p>
        let newP = parent.createElement('p');
        let childPos = p.getChildIndex(child);
        let siblings = p.childNodes.slice(childPos + 1);
        // move all subsequent siblings to the new <p>
        // and insert the block element and the new one after the current <p>
        let pos = parent.getChildIndex(p) + 1;
        parent.insertAt(pos, child);
        if (siblings.length > 0 && !_isEmpty(siblings)) {
          newP.append(siblings);
          parent.insertAt(pos + 1, newP);
        }
      }
    }
    // if the original <p> is now empty, remove it
    if (hasChanged && _isEmpty(p.childNodes)) {
      p.parentNode.removeChild(p);
    }
  }

  function _isEmpty (nodes) {
    for (let i = 0; i < nodes.length; i++) {
      let child = nodes[i];
      if (!child.isTextNode() || !(/^\s*$/.exec(child.textContent))) return false
    }
    return true
  }

  /*
    Creates empty ref-list if there is no one
    and removes everything except refs from existing ref-list.
  */
  class RefList {
    import (dom) {
      let refLists = dom.findAll('ref-list');
      if (refLists.length > 0) {
        refLists.forEach(refList => {
          let refs = refList.findAll('ref');
          refList.empty();
          refList.append(refs);
        });
      } else {
        let back = dom.find('back');
        back.append(
          dom.createElement('ref-list')
        );
      }
    }

    export () {
      // nothing
    }
  }

  const trafos = [
    NormalizeContribGroup,
    NormalizeFn,
    RefList,
    UnwrapBlockLevelElements
  ].map(C => new C());

  class JATSTransformer {
    import (jatsDom) {
      // TODO: we should create some kind of report
      trafos.forEach(t => t.import(jatsDom));
      // update the docType so that the rest of the system knows that this should be
      // interpreted as Texture JATS now
      jatsDom.setDoctype('article', TEXTURE_JATS_PUBLIC_ID, TEXTURE_JATS_DTD);
      return jatsDom
    }

    export (jatsDom) {
      // set the doctype to the JATS format which we want to produce
      jatsDom.setDoctype('article', JATS_GREEN_1_2_PUBLIC_ID, JATS_GREEN_1_DTD);
    }
  }

  var ArticlePackage = {
    name: 'article',
    configure (config) {
      // register ArticlePanel on the Texture configuration level
      config.addComponent('article', ArticlePanel);

      config.registerDocumentLoader('article', ArticleLoader);
      config.registerDocumentSerializer('article', ArticleSerializer);

      let articleConfig = config.createSubConfiguration('article', { ConfiguratorClass: ArticleConfigurator });

      // used for validation
      articleConfig.import(ArticleModelPackage);

      articleConfig.import(EntityLabelsPackage);

      articleConfig.registerSchemaId(JATS_GREEN_1_1_PUBLIC_ID);
      articleConfig.registerSchemaId(JATS_GREEN_1_2_PUBLIC_ID);

      ArticleJATSConverters.forEach(converter => {
        articleConfig.addConverter('jats', converter);
      });
      // register default 'jats' im-/exporter
      articleConfig.addImporter('jats', ArticleJATSImporter);
      articleConfig.addExporter('jats', ArticleJATSExporter);

      // register im-/exporter for TextureJATS
      articleConfig.addImporter(TEXTURE_JATS_PUBLIC_ID, ArticleJATSImporter, {
        converterGroups: ['jats']
      });
      articleConfig.addExporter(TEXTURE_JATS_PUBLIC_ID, ArticleJATSExporter, {
        converterGroups: ['jats']
      });
      let transformation = new JATSTransformer();
      // register transformations for all supported JATS versions
      // NOTE: ATM  there is only one transformation because we do not use all JATS features
      // as TextureJATS is a very strict subset of JATS
      articleConfig.addTransformation('jats', transformation);
      articleConfig.addTransformation(JATS_GREEN_1_1_PUBLIC_ID, transformation);
      articleConfig.addTransformation(JATS_GREEN_1_2_PUBLIC_ID, transformation);

      let validator = {
        schemaId: TextureJATS.publicId,
        validate (xmlDom) {
          return textureXmlUtils_cjs_9(TextureJATS, xmlDom)
        }
      };
      articleConfig.addValidator(TextureJATS.publicId, validator);

      // enable rich-text support for clipboard
      ArticleHTMLConverters.forEach(converter => {
        articleConfig.addConverter('html', converter);
      });
      articleConfig.addImporter('html', ArticleHTMLImporter);
      articleConfig.addExporter('html', ArticleHTMLExporter);

      articleConfig.addExporter('text', ArticlePlainTextExporter);

      // ATTENTION: FigureLabelGenerator works a bit differently
      // TODO: consolidate LabelGenerators and configuration
      // e.g. it does not make sense to say 'setLabelGenerator' but then only provide a configuration for 'NumberedLabelGenerator'
      articleConfig.setValue('figure-label-generator', new FigureLabelGenerator({
        singular: 'Figure $',
        plural: 'Figures $',
        and: ',',
        to: '-'
      }));
      articleConfig.setValue('footnote-label-generator', new NumberedLabelGenerator({
        template: '$',
        and: ',',
        to: '-'
      }));
      articleConfig.setValue('formula-label-generator', new NumberedLabelGenerator({
        template: '($)',
        and: ',',
        to: '-'
      }));
      articleConfig.setValue('reference-label-generator', new NumberedLabelGenerator({
        template: '[$]',
        and: ',',
        to: '-'
      }));
      articleConfig.setValue('supplementary-file-label-generator', new NumberedLabelGenerator({
        name: 'Supplementary File',
        plural: 'Supplementary Files',
        and: ',',
        to: '-'
      }));
      articleConfig.setValue('table-label-generator', new NumberedLabelGenerator({
        name: 'Table',
        plural: 'Tables',
        and: ',',
        to: '-'
      }));

      // The default article-editor is a ManuscriptEditor
      // TODO: think about how Texture can allow customizations that use a different editor
      articleConfig.addComponent('article-editor', ManuscriptEditor);
      articleConfig.import(ManuscriptPackage);

      articleConfig.import(MetadataPackage);
    }
  };

  // TODO: this is only needed for testing, so we should move this into test helpers
  function createJatsImporter (doc) {
    let config = new TextureConfigurator();
    config.import(ArticlePackage);
    let articleConfig = config.getConfiguration('article');
    if (!doc) {
      let schema = new substance.DocumentSchema({
        DocumentClass: InternalArticleDocument,
        nodes: articleConfig.getNodes(),
        // TODO: try to get rid of this by using property schema
        defaultTextType: 'paragraph'
      });
      doc = InternalArticleDocument.createEmptyArticle(schema);
    }
    let importer = articleConfig.createImporter('jats', doc);
    return importer
  }

  // TODO: this is only needed for testing, so we should move this into test helpers
  function createJatsExporter (jatsDom, doc) {
    let config = new TextureConfigurator();
    config.import(ArticlePackage);
    let articleConfig = config.getConfiguration('article');
    let exporter = articleConfig.createExporter('jats');
    return exporter
  }

  // HACK: using this to obfuscate loading of modules in nodejs
  // Instead, we should not use `require()` but use stub modules for bundling
  function _require (p) {
    let f = require;
    if (substance.platform.inNodeJS || substance.platform.inElectron) {
      return f(p)
    }
  }

  const DOT = '.'.charCodeAt(0);

  /*
    Retrieves a list of entries recursively, including file names and stats.
  */
  async function listDir (dir, opts = {}) {
    return new Promise((resolve, reject) => {
      _list(dir, opts, (err, records) => {
        if (err) reject(err);
        else resolve(records);
      });
    })
  }

  function _list (dir, opts, done) {
    let fs = opts.fs || _require('fs');
    let path = opts.path || _require('path');
    let results = [];
    fs.readdir(dir, (err, list) => {
      if (err) return done(err)
      let pending = list.length;
      if (!pending) return done(null, results)
      function _continue () {
        if (!--pending) done(null, results);
      }
      list.forEach((name) => {
        if (opts.ignoreDotFiles && name.charCodeAt(0) === DOT) {
          return _continue()
        }
        let absPath = path.resolve(dir, name);
        fs.stat(absPath, (err, stat) => {
          if (err) return done(err)
          if (stat && stat.isDirectory()) {
            _list(name, opts, (err, res) => {
              if (err) return done(err)
              results = results.concat(res);
              _continue();
            });
          } else {
            results.push(Object.assign({}, stat, {
              name,
              path: absPath
            }));
            _continue();
          }
        });
      });
    });
  }

  async function isDocumentArchive (archiveDir, opts = {}) {
    let path = opts.path || _require('path');
    // assuming it is a DAR if the folder exists and there is a manifest.xml
    return _fileExists(path.join(archiveDir, 'manifest.xml'), opts)
  }

  function _fileExists (archivePath, opts) {
    let fs = opts.fs || _require('fs');
    return new Promise((resolve, reject) => {
      fs.stat(archivePath, (err, stats) => {
        if (err) reject(err);
        else resolve(stats && stats.isFile());
      });
    })
  }

  // these extensions are considered to have text content
  const TEXTISH = ['txt', 'html', 'xml', 'json'];

  /*
    Provides a list of records found in an archive folder.

    @param {object} opts
      - `noBinaryData`: do not load the content of binary files
      - `ignoreDotFiles`: ignore dot-files
      - versioning: set to true if versioning should be enabled
  */
  async function readArchive (archiveDir, opts = {}) {
    // make sure that the given path is a dar
    if (await isDocumentArchive(archiveDir, opts)) {
      // first get a list of stats
      const entries = await listDir(archiveDir, opts);
      // then get file records as specified TODO:link
      let resources = {};
      for (var i = 0; i < entries.length; i++) {
        let entry = entries[i];
        let record = await _getFileRecord(entry, opts);
        resources[record.path] = record;
      }
      return {
        resources,
        version: '0'
      }
    } else {
      throw new Error(archiveDir + ' is not a valid document archive.')
    }
  }

  /*
    Provides a record for a file as it is used for the DocumentArchive persistence protocol.

    Binary files can be exluced using `opts.noBinaryData`.

    @example

    ```
    {
      id: 'manuscript.xml',
      encoding: 'utf8',
      data: '<article>....</article>',
      size: 5782,
      createdAt: 123098123098,
      updatedAt: 123234567890,
    }
    ```
  */
  async function _getFileRecord (fileEntry, opts) {
    let fs = opts.fs || _require('fs');
    // for text files load content
    // for binaries use a url
    let record = {
      path: fileEntry.name,
      encoding: null,
      size: fileEntry.size,
      createdAt: fileEntry.birthtime.getTime(),
      updatedAt: fileEntry.mtime.getTime()
    };
    if (_isTextFile(fileEntry.name)) {
      return new Promise((resolve, reject) => {
        fs.readFile(fileEntry.path, 'utf8', (err, content) => {
          if (err) return reject(err)
          record.encoding = 'utf8';
          record.data = content;
          resolve(record);
        });
      })
    } else {
      // used internally only
      record._binary = true;
      if (opts.noBinaryContent) {
        return Promise.resolve(record)
      } else {
        return new Promise((resolve, reject) => {
          fs.readFile(fileEntry.path, 'hex', (err, content) => {
            if (err) return reject(err)
            record.encoding = 'hex';
            record.data = content;
            resolve(record);
          });
        })
      }
    }
  }

  function _isTextFile (f) {
    return new RegExp(`\\.(${TEXTISH.join('|')})$`).exec(f)
  }

  async function writeArchive (archiveDir, rawArchive, opts = {}) {
    const fs = opts.path || _require('fs');
    const path = opts.path || _require('path');

    let resourceNames = Object.keys(rawArchive.resources);
    let newVersion = '0';

    if (opts.versioning) {
      console.warn('Git based versioning is not yet implemented.');
    }

    return Promise.all(resourceNames.map(f => {
      let record = rawArchive.resources[f];
      let absPath = path.join(archiveDir, f);
      switch (record.encoding) {
        case 'utf8': {
          return _writeFile(fs, absPath, record.data, 'utf8')
        }
        case 'blob': {
          return _writeFile(fs, absPath, record.data)
        }
        // TODO: are there other encodings which we want to support?
        default:
          return false
      }
    })).then(() => {
      return newVersion
    })
  }

  function _writeFile (fs, p, data, encoding) {
    return new Promise((resolve, reject) => {
      if (typeof data.pipe === 'function') {
        let file = fs.createWriteStream(p);
        data.pipe(file);
        file.on('close', () => {
          resolve();
        });
      } else {
        fs.writeFile(p, data, encoding, (err) => {
          if (err) reject(err);
          else resolve();
        });
      }
    })
  }

  // FIXME: this file should only get bundled in commonjs version
  let fsExtra;
  if (substance.platform.inNodeJS || substance.platform.inElectron) {
    fsExtra = _require('fs-extra');
  }

  async function cloneArchive (archiveDir, newArchiveDir, opts = {}) {
    // make sure that the given path is a dar
    if (await isDocumentArchive(archiveDir, opts)) {
      await fsExtra.copy(archiveDir, newArchiveDir);
      return true
    } else {
      throw new Error(archiveDir + ' is not a valid document archive.')
    }
  }

  /* global Buffer */

  // FIXME: this file should only get bundled in commonjs version
  let fs, path;
  if (substance.platform.inNodeJS || substance.platform.inElectron) {
    fs = _require('fs');
    path = _require('path');
  }

  /*
    A storage client optimised for Desktop clients

    NOTE: No versioning is done atm, but users can do a git init in their Dar
    folders.
  */
  class FSStorage {
    constructor (rootDir) {
      this._rootDir = rootDir;
    }

    read (archiveDir, cb) {
      archiveDir = this._normalizeArchiveDir(archiveDir);
      readArchive(archiveDir, { noBinaryContent: true, ignoreDotFiles: true })
        .then(rawArchive => {
          // Turn binaries into urls
          Object.keys(rawArchive.resources).forEach(recordPath => {
            let record = rawArchive.resources[recordPath];
            if (record._binary) {
              delete record._binary;
              record.encoding = 'url';
              record.data = path.join(archiveDir, record.path);
            }
          });
          cb(null, rawArchive);
        })
        .catch(cb);
    }

    write (archiveDir, rawArchive, cb) {
      archiveDir = this._normalizeArchiveDir(archiveDir);
      _convertBlobs(rawArchive)
        .then(() => {
          return writeArchive(archiveDir, rawArchive)
        })
        .then((version) => {
          cb(null, JSON.stringify({ version }));
        })
        .catch(cb);
    }

    clone (archiveDir, newArchiveDir, cb) {
      archiveDir = this._normalizeArchiveDir(archiveDir);
      newArchiveDir = this._normalizeArchiveDir(newArchiveDir);
      cloneArchive(archiveDir, newArchiveDir)
        .then(success => {
          if (success) cb();
          else cb(new Error('Could not clone archive'));
        })
        .catch(cb);
    }

    _normalizeArchiveDir (archiveDir) {
      if (this._rootDir) {
        archiveDir = path.join(this._rootDir, archiveDir);
      }
      return archiveDir
    }
  }

  /*
    Convert all blobs to array buffers
  */
  async function _convertBlobs (rawArchive) {
    let resources = rawArchive.resources;
    let paths = Object.keys(resources);
    for (var i = 0; i < paths.length; i++) {
      let record = resources[paths[i]];
      if (record.encoding === 'blob') {
        record.data = await _blobToArrayBuffer(record.data);
      }
    }
  }

  function _blobToArrayBuffer (blob) {
    return new Promise((resolve, reject) => {
      // TODO: is there other way to get buffer out of Blob without browser APIs?
      fs.readFile(blob.path, (err, buffer) => {
        if (err) return reject(err)
        resolve(buffer);
      });
    })
  }

  // FIXME: this file should only get bundled in commonjs version
  let fs$1, fsExtra$1, path$1, yazl, yauzl;
  if (substance.platform.inNodeJS || substance.platform.inElectron) {
    fs$1 = _require('fs');
    fsExtra$1 = _require('fs-extra');
    path$1 = _require('path');
    yazl = _require('yazl');
    yauzl = _require('yauzl');
  }

  /*
    This storage is used to store working copies of '.dar' files that are located somewhere else on the file-system.
    Texture will first update the working copy, and then updates (rewrites) the `.dar` file.

    The implementation will be done in three major iterations

    Phase I: bare-metal file-system, without versioning etc.
    - open: `dar` file is unpacked into the corresponding internal folder
    - save: internal folder is packed replacing the 'dar' file
    - new: internal folder is created and somehow seeded
    - saveas: internal folder is updated first (like in the current implementation), then cloned into a new internal folder corresponding
        to the new 'dar' file location, and packing the folder into the target 'dar'

    Phase II: basic versioning
    The idea is to have a `.dar` folder within a `dar` file that contains data used to implement versioning. We will use `hyperdrive` for that
    TODO: flesh out the concept

    Phase III: collaboration
    In addition to `hyperdrive` data we will store Texture DAR changes in the `.dar` folder. E.g., this would allow to merge two `dar` files that have a common
    version in their history.

    Status: Phase I
  */
  class DarFileStorage {
    constructor (rootDir, baseUrl) {
      this.rootDir = rootDir;
      this.baseUrl = baseUrl;

      this._internalStorage = new FSStorage();
    }

    read (darpath, cb) {
      // console.log('DarFileStorage::read', darpath)
      /*
        - unpack `dar` file as it is into the corresponding folder replacing an existing one
        - only bare-metal fs
      */
      let id = this._path2Id(darpath);
      let wcDir = this._getWorkingCopyPath(id);
      fsExtra$1.removeSync(wcDir);
      fsExtra$1.mkdirpSync(wcDir);
      this._unpack(darpath, wcDir, err => {
        if (err) return cb(err)
        this._internalStorage.read(wcDir, cb);
      });
    }

    write (darpath, rawArchive, cb) { // eslint-disble-line
      let id = this._path2Id(darpath);
      let wcDir = this._getWorkingCopyPath(id);
      this._internalStorage.write(wcDir, rawArchive, err => {
        if (err) return cb(err)
        this._pack(wcDir, darpath, cb);
      });
    }

    clone (darpath, newDarpath, cb) { // eslint-disble-line
      let id = this._path2Id(darpath);
      let wcDir = this._getWorkingCopyPath(id);
      let newId = this._path2Id(newDarpath);
      let newWcDir = this._getWorkingCopyPath(newId);
      this._internalStorage.clone(wcDir, newWcDir, err => {
        if (err) return cb(err)
        this._pack(newWcDir, newDarpath, cb);
      });
    }

    _path2Id (darpath) {
      darpath = String(darpath);
      darpath = path$1.normalize(darpath);
      // convert: '\\' to '/'
      darpath = darpath.replace(/\\+/g, '/');
      // split path into fragments: dir, name, extension
      let { dir, name } = path$1.parse(darpath);
      // ATTENTION: it is probably possible to create collisions here if somebody uses '@' in a bad way.
      // For now, this is acceptable because it is not realistic.
      // Adding an extra slash that got dropped by path.parse().
      dir += '/';
      // replace '/' with '@slash@'
      dir = dir.replace(/\//g, '@slash@');
      // replace ':' with '@colon@'
      dir = dir.replace(/:/g, '@colon@');
      return dir + name
    }

    _getWorkingCopyPath (id) {
      return path$1.join(this.rootDir, id)
    }

    _unpack (darpath, wcDir, cb) {
      // console.log('DarFileStorage::_unpack', darpath, wcDir)
      yauzl.open(darpath, { lazyEntries: true }, (err, zipfile) => {
        if (err) cb(err);
        zipfile.readEntry();
        zipfile.on('entry', (entry) => {
          // dir entry
          if (/\/$/.test(entry.fileName)) {
            zipfile.readEntry();
          // file entry
          } else {
            // console.log('... unpacking', entry.fileName)
            zipfile.openReadStream(entry, (err, readStream) => {
              if (err) throw err
              readStream.on('end', () => {
                zipfile.readEntry();
              });
              let absPath = path$1.join(wcDir, entry.fileName);
              fsExtra$1.ensureDirSync(path$1.dirname(absPath));
              readStream.pipe(fs$1.createWriteStream(absPath));
            });
          }
        });
        zipfile.on('error', err => {
          cb(err);
        });
        zipfile.once('end', () => {
          cb();
        });
      });
    }

    _pack (wcDir, darpath, cb) {
      // console.log('DarFileStorage::_pack')
      let zipfile = new yazl.ZipFile();
      listDir(wcDir).then(entries => {
        for (let entry of entries) {
          let relPath = path$1.relative(wcDir, entry.path);
          // console.log('... adding "%s" as %s', entry.path, relPath)
          zipfile.addFile(entry.path, relPath);
        }
        zipfile.outputStream.pipe(fs$1.createWriteStream(darpath)).on('close', () => {
          cb();
        });
        // call end() after all the files have been added
        zipfile.end();
      }).catch(cb);
    }

    // used by tests
    _getRawArchive (darpath, cb) {
      let id = this._path2Id(darpath);
      let wcDir = this._getWorkingCopyPath(id);
      this._internalStorage.read(wcDir, cb);
    }
  }

  /* global FormData */

  class HttpStorageClient {
    constructor (apiUrl) {
      this.apiUrl = apiUrl;
    }

    /*
      @returns a Promise for a raw archive, i.e. the data for a DocumentArchive.
    */
    read (archiveId, cb) {
      let url = this.apiUrl;
      if (archiveId) {
        url = url + '/' + archiveId;
      }
      return substance.sendRequest({
        method: 'GET',
        url
      }).then(response => {
        cb(null, JSON.parse(response));
      }).catch(err => {
        cb(err);
      })
    }

    write (archiveId, data, cb) {
      let form = new FormData();
      substance.forEach(data.resources, (record, filePath) => {
        if (record.encoding === 'blob') {
          // removing the blob from the record and submitting it as extra part
          form.append(record.id, record.data, filePath);
          delete record.data;
        }
      });
      form.append('_archive', JSON.stringify(data));
      let url = this.apiUrl;
      if (archiveId) {
        url = url + '/' + archiveId;
      }
      return substance.sendRequest({
        method: 'PUT',
        url,
        data: form
      }).then(response => {
        cb(null, response);
      }).catch(err => {
        cb(err);
      })
    }
  }

  class ManifestDocument extends substance.Document {
    constructor () {
      super(DARSchema);
    }

    getDocumentNodes () {
      return this.get('dar').resolve('documents')
    }

    getAssetNodes () {
      return this.get('dar').resolve('assets')
    }

    getAssetByPath (path) {
      return this.getAssetNodes().find(asset => asset.path === path)
    }

    getDocumentEntries () {
      return this.getDocumentNodes().map(_getEntryFromDocumentNode)
    }

    getDocumentEntry (id) {
      let entryNode = this.get(id);
      if (entryNode && entryNode.type === 'document') {
        return _getEntryFromDocumentNode(entryNode)
      }
    }

    static createEmptyManifest () {
      let doc = new ManifestDocument();
      substance.documentHelpers.createNodeFromJson(doc, {
        type: 'dar',
        id: 'dar',
        documents: [],
        assets: []
      });
      return doc
    }

    static fromXML (xmlStr) {
      let xmlDom = substance.DefaultDOMElement.parseXML(xmlStr);

      let manifest = ManifestDocument.createEmptyManifest();
      let documentEls = xmlDom.findAll('documents > document');
      for (let el of documentEls) {
        let documentNode = manifest.create({
          type: 'document',
          id: el.attr('id'),
          documentType: el.attr('type'),
          path: el.attr('path')
        });
        substance.documentHelpers.append(manifest, ['dar', 'documents'], documentNode.id);
      }
      let assetEls = xmlDom.findAll('assets > asset');
      for (let el of assetEls) {
        let assetNode = manifest.create({
          type: 'asset',
          id: el.attr('id'),
          assetType: el.attr('type'),
          path: el.attr('path'),
          sync: el.attr('sync') === 'true'
        });
        substance.documentHelpers.append(manifest, ['dar', 'assets'], assetNode.id);
      }

      return manifest
    }

    toXML () {
      let dar = this.get('dar');
      let xmlDom = substance.DefaultDOMElement.createDocument('xml');
      let $$ = xmlDom.createElement.bind(xmlDom);
      xmlDom.append(
        $$('dar').append(
          $$('documents').append(
            dar.resolve('documents').map(node => {
              return $$('document').attr({
                id: node.id,
                type: node.documentType,
                name: node.name,
                path: node.path
              })
            })
          ),
          $$('assets').append(
            dar.resolve('assets').map(node => {
              return $$('asset').attr({
                id: node.id,
                type: node.assetType,
                path: node.path,
                sync: node.sync ? 'true' : undefined
              })
            })
          )
        )
      );
      return xmlDom
    }
  }

  function _getEntryFromDocumentNode (documentNode) {
    return {
      id: documentNode.id,
      path: documentNode.path,
      type: documentNode.documentType,
      name: documentNode.name
    }
  }

  class DAR extends substance.DocumentNode {}
  DAR.schema = {
    type: 'dar',
    documents: substance.CHILDREN('document'),
    assets: substance.CHILDREN('asset')
  };

  class DARDocument extends substance.DocumentNode {}
  DARDocument.schema = {
    type: 'document',
    name: substance.STRING,
    documentType: substance.STRING,
    path: substance.STRING
  };

  class DARAsset extends substance.DocumentNode {}
  DARAsset.schema = {
    type: 'asset',
    name: substance.STRING,
    assetType: substance.STRING,
    path: substance.STRING
  };

  const DARSchema = new substance.DocumentSchema({
    DocumentClass: ManifestDocument,
    nodes: [DAR, DARDocument, DARAsset]
  });

  var ManifestLoader = {
    load (manifestXml) {
      return ManifestDocument.fromXML(manifestXml)
    }
  };

  class InMemoryDarBuffer {
    constructor () {
      this._version = null;
      this._changes = [];
      this._isDirty = {};
      this._blobs = {};
    }

    getVersion () {
      return this._version
    }

    load(archiveId, cb) { // eslint-disable-line
      cb();
    }

    addChange (docId, change) {
      // HACK: if there are no ops we skip
      if (change.ops.length === 0) return
      // console.log('RECORD CHANGE', docId, change)
      this._isDirty[docId] = true;
      this._changes.push({
        docId, change
      });
    }

    hasPendingChanges () {
      return this._changes.length > 0
    }

    getChanges () {
      return this._changes.slice()
    }

    hasResourceChanged (docId) {
      return this._isDirty[docId]
    }

    hasBlobChanged (assetId) {
      return Boolean(this._isDirty[assetId])
    }

    addBlob (assetId, blob) {
      this._isDirty[assetId] = true;
      this._blobs[assetId] = blob;
    }

    getBlob (assetId) {
      return this._blobs[assetId]
    }

    reset (version) {
      this._version = version;
      this._changes = [];
      this._blobs = {};
      this._isDirty = {};
    }
  }

  /* globals Blob */

  /*
    A PersistedDocumentArchive is a 3-tier stack representing a document archive
    at different application levels:

    1. Editor: an application such as Texture works on an in-memory data model,
       managed by EditorSessions.
    2. Buffer: a short-term storage for pending changes. Until the document archive
       is saved permanently, changes are recorded and can be persisted, e.g. to
       avoid loosing changes when the browser is closed inadvertently.
    3. Storage: a long-term storage where the document archive is persisted and versioned.

    PersistedDocumentArchive manages the communication between the three layers, e.g.
    when the user changes a document, it records the change and stores it into the buffer,
    and eventually saving a new version of the ardhive.
  */
  class PersistedDocumentArchive extends substance.EventEmitter {
    constructor (storage, buffer, context, config) {
      super();
      this.storage = storage;
      this.buffer = buffer;

      this._archiveId = null;
      this._upstreamArchive = null;
      this._documents = null;
      this._pendingFiles = new Map();
      this._config = config;
    }

    addDocument (type, name, xml) {
      let documentId = substance.uuid();
      let documents = this._documents;
      let document = this._loadDocument(type, { data: xml }, documents);
      documents[documentId] = document;
      this._registerForChanges(document, documentId);
      this._addDocumentRecord(documentId, type, name, documentId + '.xml');
      return documentId
    }

    addAsset (file) {
      let assetId = substance.uuid();
      let [name, ext] = _getNameAndExtension(file.name);
      let filePath = this._getUniqueFileName(name, ext);
      // TODO: this is not ready for collab
      let manifest = this._documents['manifest'];
      let assetNode = manifest.create({
        type: 'asset',
        id: assetId,
        path: filePath,
        assetType: file.type
      });
      substance.documentHelpers.append(manifest, ['dar', 'assets'], assetNode.id);
      this.buffer.addBlob(assetId, {
        id: assetId,
        path: filePath,
        blob: file
      });
      // ATTENTION: blob urls are not supported in nodejs
      // and I do not see that this is really necessary
      // For sake of testing we use `PSEUDO-BLOB-URL:${filePath}`
      // so that we can see if the rest of the system is working
      if (substance.platform.inBrowser) {
        this._pendingFiles.set(filePath, {
          blob: file,
          blobUrl: URL.createObjectURL(file)
        });
      } else {
        this._pendingFiles.set(filePath, {
          blob: file,
          blobUrl: `PSEUDO-BLOB-URL:${filePath}`
        });
      }
      return filePath
    }

    getAsset (fileName) {
      return this._documents['manifest'].getAssetByPath(fileName)
    }

    getAssetEntries () {
      return this._documents['manifest'].getAssetNodes().map(node => node.toJSON())
    }

    getBlob (path) {
      // There are the following cases
      // 1. the asset is on a different server (remote url)
      // 2. the asset is on the local server (local url / relative path)
      // 3. an unsaved is present as a blob in memory
      let blobEntry = this._pendingFiles.get(path);
      if (blobEntry) {
        return Promise.resolve(blobEntry.blob)
      } else {
        let fileRecord = this._upstreamArchive.resources[path];
        if (fileRecord) {
          if (fileRecord.encoding === 'url') {
            if (substance.platform.inBrowser) {
              return substance.sendRequest({
                method: 'GET',
                url: fileRecord.data,
                responseType: 'blob'
              })
            } else {
              // TODO: add a proper implementation for nodejs
              const fs = _require('fs');
              return new Promise((resolve, reject) => {
                fs.readFile(fileRecord.data, (err, data) => {
                  if (err) reject(err);
                  else resolve(data);
                });
              })
            }
          } else {
            let blob = substance.platform.inBrowser ? new Blob([fileRecord.data]) : fileRecord.data;
            return Promise.resolve(blob)
          }
        } else {
          return Promise.reject(new Error('File not found: ' + path))
        }
      }
    }

    getDocumentEntries () {
      return this.getDocument('manifest').getDocumentEntries()
    }

    getDownloadLink (fileName) {
      let manifest = this.getDocument('manifest');
      let asset = manifest.getAssetByPath(fileName);
      if (asset) {
        return this.resolveUrl(fileName)
      }
    }

    getDocument (docId) {
      return this._documents[docId]
    }

    hasAsset (fileName) {
      // TODO: at some point I want to introduce an index for files by fileName/path
      return Boolean(this.getAsset(fileName))
    }

    hasPendingChanges () {
      return this.buffer.hasPendingChanges()
    }

    load (archiveId, cb) {
      const storage = this.storage;
      const buffer = this.buffer;
      storage.read(archiveId, (err, upstreamArchive) => {
        if (err) return cb(err)
        buffer.load(archiveId, err => {
          if (err) return cb(err)
          // Ensure that the upstream version is compatible with the buffer.
          // The buffer may contain pending changes.
          // In this case the buffer should be based on the same version
          // as the latest version in the storage.
          if (!buffer.hasPendingChanges()) {
            let localVersion = buffer.getVersion();
            let upstreamVersion = upstreamArchive.version;
            if (localVersion && upstreamVersion && localVersion !== upstreamVersion) {
              // If the local version is out-of-date, it would be necessary to 'rebase' the
              // local changes.
              console.error('Upstream document has changed. Discarding local changes');
              this.buffer.reset(upstreamVersion);
            } else {
              buffer.reset(upstreamVersion);
            }
          }
          // convert raw archive to documents (=ingestion)
          let documents = this._ingest(upstreamArchive);
          // contract: there must be a manifest
          if (!documents['manifest']) {
            throw new Error('There must be a manifest.')
          }
          // apply pending changes
          if (!buffer.hasPendingChanges()) ; else {
            buffer.reset(upstreamArchive.version);
          }
          // register for any changes in each document
          this._registerForAllChanges(documents);

          this._archiveId = archiveId;
          this._upstreamArchive = upstreamArchive;
          this._documents = documents;

          cb(null, this);
        });
      });
    }

    removeDocument (documentId) {
      let document = this._documents[documentId];
      if (document) {
        this._unregisterFromDocument(document);
        // TODO: this is not ready for collab
        let manifest = this._documents['manifest'];
        substance.documentHelpers.removeFromCollection(manifest, ['dar', 'documents'], documentId);
        substance.documentHelpers.deepDeleteNode(manifest, documentId);
      }
    }

    renameDocument (documentId, name) {
      // TODO: this is not ready for collab
      let manifest = this._documents['manifest'];
      let documentNode = manifest.get(documentId);
      documentNode.name = name;
    }

    resolveUrl (path) {
      // until saved, files have a blob URL
      let blobEntry = this._pendingFiles.get(path);
      if (blobEntry) {
        return blobEntry.blobUrl
      } else {
        let fileRecord = this._upstreamArchive.resources[path];
        if (fileRecord && fileRecord.encoding === 'url') {
          return fileRecord.data
        }
      }
    }

    save (cb) {
      // FIXME: buffer.hasPendingChanges() is not working
      this.buffer._isDirty['manuscript'] = true;
      this._save(this._archiveId, cb);
    }

    /*
      Save as is implemented as follows.

      1. clone: copy all files from original archive to new archive (backend)
      2. save: perform a regular save using user buffer (over new archive, including pending
         documents and blobs)
    */
    saveAs (newArchiveId, cb) {
      this.storage.clone(this._archiveId, newArchiveId, (err) => {
        if (err) return cb(err)
        this._save(newArchiveId, cb);
      });
    }

    /*
      Adds a document record to the manifest file
    */
    _addDocumentRecord (documentId, type, name, path) {
      // TODO: this is not collab ready
      let manifest = this._documents['manifest'];
      let documentNode = manifest.create({
        type: 'document',
        id: documentId,
        documentType: type,
        name,
        path
      });
      substance.documentHelpers.append(manifest, ['dar', 'documents', documentNode.id]);
    }

    _getUniqueFileName (name, ext) {
      let candidate;
      // first try the canonical one
      candidate = `${name}.${ext}`;
      if (this.hasAsset(candidate)) {
        let count = 2;
        // now use a suffix counting up
        while (true) {
          candidate = `${name}_${count++}.${ext}`;
          if (!this.hasAsset(candidate)) break
        }
      }

      return candidate
    }

    _loadManifest (record) {
      if (!record) {
        throw new Error('manifest.xml is missing')
      }
      return ManifestLoader.load(record.data)
    }

    _registerForAllChanges (documents) {
      substance.forEach(documents, (document, docId) => {
        this._registerForChanges(document, docId);
      });
    }

    _registerForChanges (document, docId) {
      document.on('document:changed', change => {
        this.buffer.addChange(docId, change);
        // Apps can subscribe to this (e.g. to show there's pending changes)
        this.emit('archive:changed');
      }, this);
    }

    _repair () {
      // no-op
    }

    /*
      Create a raw archive for upload from the changed resources.
    */
    _save (archiveId, cb) {
      const buffer = this.buffer;
      const storage = this.storage;

      let rawArchiveUpdate = this._exportChanges(this._documents, buffer);

      // CHALLENGE: we either need to lock the buffer, so that
      // new changes are interfering with ongoing sync
      // or we need something pretty smart caching changes until the
      // sync has succeeded or failed, e.g. we could use a second buffer in the meantime
      // probably a fast first-level buffer (in-mem) is necessary anyways, even in conjunction with
      // a slower persisted buffer
      storage.write(archiveId, rawArchiveUpdate, (err, res) => {
        // TODO: this need to implemented in a more robust fashion
        // i.e. we should only reset the buffer if storage.write was successful
        if (err) return cb(err)

        // TODO: if successful we should receive the new version as response
        // and then we can reset the buffer
        let _res = { version: '0' };
        if (substance.isString(res)) {
          try {
            _res = JSON.parse(res);
          } catch (err) {
            console.error('Invalid response from storage.write()');
          }
        }
        // console.log('Saved. New version:', res.version)
        buffer.reset(_res.version);
        // revoking object urls
        if (substance.platform.inBrowser) {
          for (let blobEntry of this._pendingFiles.values()) {
            window.URL.revokeObjectURL(blobEntry.blobUrl);
          }
        }
        this._pendingFiles.clear();

        // After successful save the archiveId may have changed (save as use case)
        this._archiveId = archiveId;
        this.emit('archive:saved');
        cb(null, rawArchiveUpdate);
      });
    }

    _unregisterFromDocument (document) {
      document.off(this);
    }

    /*
      Uses the current state of the buffer to generate a rawArchive object
      containing all changed documents
    */
    _exportChanges (documents, buffer) {
      let rawArchive = {
        version: buffer.getVersion(),
        diff: buffer.getChanges(),
        resources: {}
      };
      this._exportManifest(documents, buffer, rawArchive);
      this._exportChangedDocuments(documents, buffer, rawArchive);
      this._exportChangedAssets(documents, buffer, rawArchive);
      return rawArchive
    }

    _exportManifest (documents, buffer, rawArchive) {
      let manifest = documents['manifest'];
      if (buffer.hasResourceChanged('manifest')) {
        let manifestDom = manifest.toXML();
        let manifestXmlStr = substance.prettyPrintXML(manifestDom);
        rawArchive.resources['manifest.xml'] = {
          id: 'manifest',
          data: manifestXmlStr,
          encoding: 'utf8',
          updatedAt: Date.now()
        };
      }
    }

    // TODO: generalize the implementation so that it can live here
    _exportChangedDocuments (documents, buffer, rawArchive) {
      throwMethodIsAbstract();
    }

    _exportChangedAssets (documents, buffer, rawArchive) {
      let manifest = documents['manifest'];
      let assetNodes = manifest.getAssetNodes();
      assetNodes.forEach(asset => {
        let assetId = asset.id;
        if (buffer.hasBlobChanged(assetId)) {
          let path = asset.path || assetId;
          let blobRecord = buffer.getBlob(assetId);
          rawArchive.resources[path] = {
            assetId,
            data: blobRecord.blob,
            encoding: 'blob',
            createdAt: Date.now(),
            updatedAt: Date.now()
          };
        }
      });
    }
  }

  function _getNameAndExtension (name) {
    let frags = name.split('.');
    let ext = '';
    if (frags.length > 1) {
      ext = substance.last(frags);
      name = frags.slice(0, frags.length - 1).join('.');
    }
    return [name, ext]
  }

  /**
   * A storage implementation that is bound to a single folder.
   */
  class UnpackedDarFolderStorage extends FSStorage {
    constructor (darFolder) {
      super();

      this.darFolder = darFolder;
    }

    _normalizeArchiveDir () {
      return this.darFolder
    }

    clone (archiveDir, newArchiveDir, cb) {
      cb(new Error('Cloning is not supported by this storage type.'));
    }
  }

  const SLASH = '/'.charCodeAt(0);

  class Vfs {
    constructor (data) {
      this._data = data;
    }

    existsSync (path) {
      return this._data.hasOwnProperty(path)
    }

    readFileSync (path) {
      if (path.charCodeAt(0) === SLASH) {
        path = path.slice(1);
      }
      if (!this.existsSync(path)) {
        throw new Error('File does not exist: ' + path)
      }
      return this._data[path]
    }

    writeFileSync (path, content) {
      if (path.charCodeAt(0) === SLASH) {
        path = path.slice(1);
      }
      this._data[path] = content;
    }
  }

  class VfsStorageClient {
    constructor (vfs, baseUrl, options = {}) {
      this.vfs = vfs;

      // an url rom where the assets are served statically
      this.baseUrl = baseUrl;
      this.options = options;
    }

    read (archiveId, cb) {
      let rawArchive = _readRawArchive(this.vfs, archiveId, this.baseUrl);
      cb(null, rawArchive);
    }

    write (archiveId, data, cb) { // eslint-disable-line
      if (this.options.writable) {
        _updateRawArchive(this.vfs, archiveId, data, this.baseUrl);
      }
      cb(null, true);
    }
  }

  function _readRawArchive (fs, archiveId, baseUrl = '') {
    let manifestXML = fs.readFileSync(`${archiveId}/manifest.xml`);
    let manifest = ManifestLoader.load(manifestXML);
    let docs = manifest.getDocumentNodes();
    let assets = manifest.getAssetNodes();
    let rawArchive = {
      version: '0',
      resources: {
        'manifest.xml': {
          encoding: 'utf8',
          data: manifestXML
        }
      }
    };

    docs.forEach(entry => {
      let path = entry.path;
      if (fs.existsSync(`${archiveId}/${entry.path}`)) {
        let content = fs.readFileSync(`${archiveId}/${entry.path}`);
        rawArchive.resources[path] = {
          encoding: 'utf8',
          data: content
        };
      } else {
        console.warn(`${archiveId}/${entry.path} not found in vfs`);
      }
    });
    assets.forEach(asset => {
      let path = asset.path;
      // TODO: we could store other stats and maybe mime-types in VFS
      rawArchive.resources[path] = {
        encoding: 'url',
        data: baseUrl + archiveId + '/' + path
      };
    });
    return rawArchive
  }

  function _updateRawArchive (fs, archiveId, rawArchive, baseUrl = '') {
    let paths = Object.keys(rawArchive.resources);
    for (let path of paths) {
      let resource = rawArchive.resources[path];
      let data = resource.data;
      fs.writeFileSync(`${archiveId}/${path}`, data);
    }
  }

  function createDemoVfs () {
    let dom = substance.DefaultDOMElement.parseXML(EMPTY_JATS);
    // add an empty paragraph into the empty body
    let $$ = dom.createElement.bind(dom);
    let bodyEl = dom.find('body');
    bodyEl.append(
      $$('p').attr('id', 'p-1').text('')
    );
    let manuscriptXML = dom.serialize();
    let data = {
      'demo/manifest.xml': "<dar>\n  <documents>\n    <document id=\"manuscript\" type=\"article\" path=\"manuscript.xml\" />\n  </documents>\n  <assets>\n  </assets>\n</dar>\n", //eslint-disable-line
      'demo/manuscript.xml': manuscriptXML
    };
    return new Vfs(data)
  }

  function updateEntityChildArray (tx, nodeId, tagName, attribute, oldEntityIds, newEntityIds) {
    let node = tx.get(nodeId);
    let addedEntityIds = substance.without(newEntityIds, ...oldEntityIds);
    let removedEntityIds = substance.without(oldEntityIds, ...newEntityIds);

    // Remove old entities
    removedEntityIds.forEach(entityId => {
      let entityRefNode = node.find(`${tagName}[${attribute}=${entityId}]`);
      node.removeChild(entityRefNode);
      // Remove it completely
      tx.delete(entityRefNode.id);
    });

    // Create new entities
    addedEntityIds.forEach(entityId => {
      let entityRefNode = node.find(`${tagName}[${attribute}=${entityId}]`);
      if (!entityRefNode) {
        let opts = {};
        if (attribute === 'id') {
          opts = { id: entityId };
        }
        entityRefNode = tx.createElement(tagName, opts);
        if (attribute !== 'id') {
          entityRefNode.setAttribute(attribute, entityId);
        }
      }
      node.appendChild(entityRefNode);
    });

    // Sort entities in order of newEntityIds array
    let map = {};
    let refs = tx.findAll(`${tagName}`);
    refs.forEach(ref => {
      const rid = ref.getAttribute('rid');
      map[rid] = ref;
    });
    node.children.forEach(child => {
      node.removeChild(child);
    });
    newEntityIds.forEach(entityId => {
      node.appendChild(map[entityId]);
    });

    tx.setSelection(null);
  }

  function checkLoadArchive (ArchiveClass, rawArchive) {
    let testArchive = new ArchiveClass();
    try {
      testArchive._ingest(rawArchive);
    } catch (error) {
      /* istanbul ignore next */
      return error
    }
  }

  /* istanbul ignore file */

  function vfsSaveHook (storage, ArchiveClass) {
    // monkey patch VfsStorageClient so that we can check if the stored data
    // can be loaded
    storage.write = (archiveId, rawArchive, cb) => {
      console.info('Writing archive:', rawArchive); // eslint-disable-line
      storage.read(archiveId, (err, originalRawArchive) => {
        if (err) return cb(err)
        rawArchive.resources = Object.assign({}, originalRawArchive.resources, rawArchive.resources);
        err = checkLoadArchive(ArchiveClass, rawArchive);
        if (err) {
          if (substance.platform.inBrowser) {
            console.error(err);
            window.alert('Exported archive is corrupt!'); // eslint-disable-line no-alert
          }
          console.error(err.detail);
          return cb(err)
        } else {
          return cb(null, true)
        }
      });
    };
  }

  // TODO: this should incoporate the 'Project' stuff that we have in Stencila
  class Texture extends substance.Component {
    getInitialState () {
      return {
        currentDocumentName: 'manuscript'
      }
    }

    render ($$) {
      const config = this.props.config;
      const archive = this.props.archive;
      let el = $$('div').addClass('sc-texture');

      // TODO: switch by current document tab
      const currentDocumentName = this.state.currentDocumentName;
      const ResourceComponent = config.getComponent('article');
      const articleConfig = config.getConfiguration('article');
      const document = archive.getDocument(currentDocumentName);
      let props = {
        archive,
        config: articleConfig,
        document
      };
      el.append(
        $$(ResourceComponent, props).ref('resource')
      );
      if (substance.platform.inBrowser && !substance.platform.isChromium && !substance.platform.inElectron && !substance.platform.isFF) {
        el.append(
          $$(PinnedMessage, { icon: 'fa-warning', label: 'This editor may may not work fully in your browser. If you experience problems, please try loading the editor in Firefox or Chrome.' })
        );
      }
      return el
    }

    static registerPlugin (plugin) {
      let plugins = Texture.plugins;
      if (!plugins) {
        Texture.plugins = plugins = new Map();
      }
      let name = plugin.name;
      if (plugins.has(name)) {
        throw new Error(`Plugin with name '${name}' has already been registered`)
      }
      plugins.set(name, plugin);
    }

    static getConfiguration () {
      let plugins = Texture.plugins;
      let config = new TextureConfigurator();
      for (let plugin of plugins.values()) {
        // TODO: allow to disable plugins via a settings dialog
        plugin.configure(config);
      }
      return config
    }

    _handleKeydown (event) {
      this.refs.resource._handleKeydown(event);
    }
  }

  // register the core plugins here
  Texture.registerPlugin(ArticlePackage);

  class TextureAppChrome extends substance.Component {
    constructor (...args) {
      super(...args);

      if (this.props.enableRouting) {
        this._router = new substance.Router();
      }

      // TODO: rethink how configuration is loaded
      this._config = Texture.getConfiguration();
    }

    getChildContext () {
      return this._childContext || {}
    }

    getInitialState () {
      return {
        archive: undefined,
        error: undefined
      }
    }

    didMount () {
      this._init(err => {
        // if debug is turned on do not 'forward' to an error display and instead
        // leave the app in its failed state
        if (err) {
          console.error(err);
          // TODO: we need to make sure that we disable 'debug' when bundling the release version
          if (!this.props.debug) {
            this.setState({ error: err });
          }
        }
      });
      // Note: adding global handlers causes problems in the test suite
      if (!substance.platform.test) {
        substance.DefaultDOMElement.getBrowserWindow().on('keydown', this._keyDown, this);
        substance.DefaultDOMElement.getBrowserWindow().on('drop', substance.domHelpers.stopAndPrevent, this);
        substance.DefaultDOMElement.getBrowserWindow().on('dragover', substance.domHelpers.stopAndPrevent, this);
      }
      if (this._router) {
        this._router.start();
      }
      this.handleActions({
        'save': this._handleSave
      });
    }

    dispose () {
      substance.DefaultDOMElement.getBrowserWindow().off(this);
    }

    _getBuffer () {
      throwMethodIsAbstract();
    }

    _getStorage () {
      throwMethodIsAbstract();
    }

    _loadArchive (archiveId, context, cb) {
      const ArchiveClass = this._getArchiveClass();
      let storage = this._getStorage();
      let buffer = this._getBuffer();
      let archive = new ArchiveClass(storage, buffer, context, this._config);
      // HACK: this should be done earlier in the lifecycle (after first didMount)
      // and later disposed properly. However we can accept this for now as
      // the app lives as a singleton atm.
      archive.on('archive:changed', this._archiveChanged, this);
      // Don't catch exception in debug mode
      const _afterLoad = (err, archive) => {
        if (err) return cb(err)
        if (this.props.isReadOnly) {
          archive.isReadOnly = true;
        }
        cb(null, archive);
      };
      if (this.props.debug) {
        archive.load(archiveId, _afterLoad);
      } else {
        try {
          archive.load(archiveId, _afterLoad);
        } catch (err) {
          this.setState({
            error: err
          });
          console.error(err);
        }
      }
    }

    _init (cb) {
      if (!cb) cb = (err) => { if (err) throw err };
      this._setupChildContext((err, context) => {
        if (err) return cb(err)
        this._initContext(context, (err, context) => {
          if (err) return cb(err)
          this._loadArchive(this.props.archiveId, context, (err, archive) => {
            if (err) return cb(err)
            this._initArchive(archive, context, (err, archive) => {
              if (err) return cb(err)
              this._childContext = context;
              this.setState({ archive });
              this._afterInit();
              this.emit('archive:ready');
            });
          });
        });
      });
    }

    _setupChildContext (cb) {
      cb(null, { router: this._router });
    }

    _initContext (context, cb) {
      cb(null, context);
    }

    _initArchive (archive, context, cb) {
      cb(null, archive);
    }

    _afterInit () {
      // Update window title after archive loading to display title
      this._updateTitle();
    }

    _archiveChanged () {
      this._updateTitle();
    }

    _handleSave () {
      this._save((err) => {
        if (err) console.error(err);
      });
    }

    _save (cb) {
      this.state.archive.save((err, update) => {
        if (err) return cb(err)
        this._updateTitle();
        cb(null, update);
      });
    }

    _updateTitle () {}

    _keyDown (event) {
      // TODO: should this really be suppressed here?
      if (event.key === 'Dead') return
      if (this._handleKeydown) {
        this._handleKeydown(event);
      }
    }

    _handleKeydown (event) {
      let handled = false;
      handled = this.refs.texture._handleKeydown(event);
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  class TextureArchive extends PersistedDocumentArchive {
    /*
      Creates EditorSessions from a raw archive.
      This might involve some consolidation and ingestion.
    */
    _ingest (rawArchive) {
      let documents = {};
      let manifestXML = _importManifest(rawArchive);
      let manifest = this._loadManifest({ data: manifestXML });
      documents['manifest'] = manifest;
      let entries = manifest.getDocumentEntries();

      entries.forEach(entry => {
        let record = rawArchive.resources[entry.path];
        // Note: this happens when a resource is referenced in the manifest
        // but is not there actually
        // we skip loading here and will fix the manuscript later on
        if (!record) {
          return
        }
        // TODO: we need better concept for handling errors
        let document = this._loadDocument(entry.type, record, documents);
        documents[entry.id] = document;
      });
      return documents
    }

    // TODO: this should be generalized and then live in the base class
    _exportChangedDocuments (documents, buffer, rawArchive) {
      // Note: we are only adding resources that have changed
      // and only those which are registered in the manifest
      let entries = this.getDocumentEntries();
      for (let entry of entries) {
        let { id, type, path } = entry;
        const hasChanged = buffer.hasResourceChanged(id);
        // skipping unchanged resources
        if (!hasChanged) continue
        // We mark a resource dirty when it has changes, or if it is an article
        // and pub-meta has changed
        if (type === 'article') {
          let document = documents[id];
          // TODO: how should we communicate file renamings?
          rawArchive.resources[path] = {
            id,
            data: this._exportDocument(type, document, documents),
            encoding: 'utf8',
            updatedAt: Date.now()
          };
        }
      }
    }

    _loadDocument(type, record, documents) {
      let config = this._config;
      if (config) {
        let loader = config.getDocumentLoader(type);
        if (loader) {
          return loader.load(record.data, config)
        } else {
          // throw new Error('Unsupported document type')
          console.info('Unsupported document type');
        }
      }
    }

    _exportDocument (type, document, documents) { // eslint-disable-line no-unused-vars
      let serializer = this._config.getDocumentSerializer(type);
      if (serializer) {
        return serializer.export(document, this._config)
      } else {
        // throw new Error('Unsupported document type')
        console.info('Unsupported document type');
      }
    }

    getTitle () {
      // TODO: the name of the 'main' document should not be hard-coded
      let mainDocument = this.getDocument('manuscript');
      let title = 'Untitled';
      if (mainDocument) {
        let articleTitle = mainDocument.getTitle();
        if (articleTitle) {
          title = articleTitle;
        }
      }
      return title
    }
  }

  /*
    Create an explicit entry for pub-meta.json, which does not
    exist in the serialisation format
  */
  function _importManifest (rawArchive) {
    let manifestXML = rawArchive.resources['manifest.xml'].data;
    let dom = substance.DefaultDOMElement.parseXML(manifestXML);
    return dom.serialize()
  }

  function TextureAppMixin (ParentAppChrome) {
    return class TextureApp extends ParentAppChrome {
      render ($$) {
        let el = $$('div').addClass('sc-app');
        let { archive, error } = this.state;
        if (archive) {
          const config = this._config;
          const Texture = this._getAppClass();
          el.append(
            $$(Texture, { config, archive }).ref('texture')
          );
        } else if (error) {
          let ErrorRenderer = this.getComponent(error.type);
          if (ErrorRenderer) {
            el.append(
              $$(ErrorRenderer, { error })
            );
          } else {
            el.append('ERROR:', error.message);
          }
        }
        return el
      }

      _getAppClass () {
        return Texture
      }

      _getArchiveClass () {
        return TextureArchive
      }
    }
  }

  class TextureDesktopAppChrome extends TextureAppChrome {
    didMount () {
      super.didMount();

      substance.DefaultDOMElement.getBrowserWindow().on('click', this._click, this);
    }

    _getBuffer () {
      return new InMemoryDarBuffer()
    }

    _getStorage () {
      // Note: in the Desktop app, the storage is maintained by the main process
      // and passed as a prop directly. In contrast to the web-version
      // there is no control via HTTP param possible
      return this.props.storage
    }

    // emit an event on this component. The Electron binding in app.js listens to it and
    // handles it
    _handleSave () {
      this.emit('save');
    }

    _saveAs (newDarPath, cb) {
      console.info('saving as', newDarPath);
      let archive = this.state.archive;
      archive.saveAs(newDarPath, err => {
        if (err) {
          console.error(err);
          return cb(err)
        }
        // HACK: this is kind of an optimization but formally it is not
        // 100% correct to continue with the same archive instance
        // Instead one would expect that cloning an archive returns
        // a new archive instance
        // Though, this would have other undesired implications
        // such as loosing the scroll position or undo history
        // Thus we move on with this solution, but we need to clear
        // the isReadOnly flag now.
        archive.isReadOnly = false;
        this._updateTitle();
        cb();
      });
    }

    _updateTitle () {
      const archive = this.state.archive;
      if (!archive) return
      let newTitle = archive.getTitle();
      if (archive.hasPendingChanges()) {
        newTitle += ' *';
      }
      document.title = newTitle;
    }

    _click (event) {
      const target = substance.DefaultDOMElement.wrapNativeElement(event.target);
      let url = target.getAttribute('href');
      if (target.is('a') && url !== '#') {
        event.preventDefault();
        this.emit('openExternal', url);
      }
    }
  }

  class TextureDesktopApp extends TextureAppMixin(TextureDesktopAppChrome) {}

  class TextureWebAppChrome extends TextureAppChrome {
    _getBuffer () {
      return new InMemoryDarBuffer()
    }

    _getStorage () {
      let storageType = this.props.storageType;
      if (storageType === 'vfs') {
        let vfs = this.props.vfs;
        if (!vfs) {
          throw new Error('No VirtualFilesystem instance provided.')
        }
        return new VfsStorageClient(vfs, this._getDefaultDataFolder())
      } else {
        return new HttpStorageClient(this.props.storageUrl)
      }
    }

    // TODO: try to share implementation with TextureDesktopAppChrome
    // move as much as possible into TextureAppChrome
    // and only add browser specific overrides here
    _handleKeydown (event) {
      let key = substance.parseKeyEvent(event);
      // console.log('Texture received keydown for combo', key)
      let handled = false;
      // CommandOrControl+S
      if (key === 'META+83' || key === 'CTRL+83') {
        this._save(err => {
          if (err) console.error(err);
        });
        handled = true;
      }
      if (!handled) {
        handled = this.refs.texture._handleKeydown(event);
      }
      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  }

  class TextureWebApp extends TextureAppMixin(TextureWebAppChrome) {
    _getDefaultDataFolder () {
      return Texture.defaultDataFolder || './data/'
    }
  }

  const _global = (typeof global !== 'undefined') ? global : window;
  const textureGlobals = _global.hasOwnProperty('Texture') ? _global.Texture : _global.Texture = {
    DEBUG: false
  };

  Object.defineProperty(exports, 'AnnotationComponent', {
    enumerable: true,
    get: function () {
      return substance.AnnotationComponent;
    }
  });
  Object.defineProperty(exports, 'AppState', {
    enumerable: true,
    get: function () {
      return substance.AppState;
    }
  });
  Object.defineProperty(exports, 'Clipboard', {
    enumerable: true,
    get: function () {
      return substance.Clipboard;
    }
  });
  Object.defineProperty(exports, 'DocumentObserver', {
    enumerable: true,
    get: function () {
      return substance.DocumentObserver;
    }
  });
  Object.defineProperty(exports, 'EditorSession', {
    enumerable: true,
    get: function () {
      return substance.EditorSession;
    }
  });
  Object.defineProperty(exports, 'EditorState', {
    enumerable: true,
    get: function () {
      return substance.EditorState;
    }
  });
  Object.defineProperty(exports, 'FindAndReplacePackage', {
    enumerable: true,
    get: function () {
      return substance.FindAndReplacePackage;
    }
  });
  Object.defineProperty(exports, 'IsolatedInlineNodeComponent', {
    enumerable: true,
    get: function () {
      return substance.IsolatedInlineNodeComponent;
    }
  });
  Object.defineProperty(exports, 'JSONConverter', {
    enumerable: true,
    get: function () {
      return substance.JSONConverter;
    }
  });
  Object.defineProperty(exports, 'ModalEditorSession', {
    enumerable: true,
    get: function () {
      return substance.ModalEditorSession;
    }
  });
  Object.defineProperty(exports, 'SwitchTextTypeCommand', {
    enumerable: true,
    get: function () {
      return substance.SwitchTextTypeCommand;
    }
  });
  Object.defineProperty(exports, 'TextPropertyComponent', {
    enumerable: true,
    get: function () {
      return substance.TextPropertyComponent;
    }
  });
  Object.defineProperty(exports, 'createComponentContext', {
    enumerable: true,
    get: function () {
      return substance.createComponentContext;
    }
  });
  Object.defineProperty(exports, 'createEditorContext', {
    enumerable: true,
    get: function () {
      return substance.createEditorContext;
    }
  });
  exports.ABSTRACT_TYPES = ABSTRACT_TYPES;
  exports.ARABIC_NUMBERS = ARABIC_NUMBERS;
  exports.ARTICLE_REF = ARTICLE_REF;
  exports.Abstract = Abstract;
  exports.AbstractComponent = AbstractComponent;
  exports.AbstractScrollPane = AbstractScrollPane;
  exports.AddAffiliationCommand = AddAffiliationCommand;
  exports.AddAuthorCommand = AddAuthorCommand;
  exports.AddEntityCommand = AddEntityCommand;
  exports.AddFigureMetadataFieldCommand = AddFigureMetadataFieldCommand;
  exports.AddFigurePanelCommand = AddFigurePanelCommand;
  exports.AddReferenceCommand = AddAuthorCommand$1;
  exports.AddSupplementaryFileWorkflow = AddSupplementaryFileWorkflow;
  exports.Affiliation = Affiliation;
  exports.AnnotationCommand = AnnotationCommand;
  exports.Article = Article;
  exports.ArticleAPI = ArticleAPI;
  exports.ArticleEditorSession = ArticleEditorSession;
  exports.ArticleHTMLConverters = ArticleHTMLConverters;
  exports.ArticleHTMLExporter = ArticleHTMLExporter;
  exports.ArticleHTMLImporter = ArticleHTMLImporter;
  exports.ArticleJATSExporter = ArticleJATSExporter;
  exports.ArticleJATSImporter = ArticleJATSImporter;
  exports.ArticleLoader = ArticleLoader;
  exports.ArticlePackage = ArticlePackage;
  exports.ArticlePanel = ArticlePanel;
  exports.ArticleRef = ArticleRef;
  exports.ArticleSerializer = ArticleSerializer;
  exports.AuthorsListComponent = AuthorsListComponent;
  exports.BLOCK_LEVEL = BLOCK_LEVEL;
  exports.BOOK_REF = BOOK_REF;
  exports.BasePackage = BasePackage;
  exports.BlockFormula = BlockFormula;
  exports.BlockFormulaComponent = BlockFormulaComponent;
  exports.BlockQuote = BlockQuote;
  exports.BlockQuoteComponent = BlockQuoteComponent;
  exports.Body = Body;
  exports.BodyScrollPane = BodyScrollPane;
  exports.Bold = Bold;
  exports.BoldComponent = BoldComponent;
  exports.BookRef = BookRef;
  exports.BooleanComponent = BooleanComponent;
  exports.BooleanModel = BooleanModel;
  exports.Break = Break;
  exports.BreakComponent = BreakComponent;
  exports.Button = Button;
  exports.CARD_MINIMUM_FIELDS = CARD_MINIMUM_FIELDS;
  exports.CHAPTER_REF = CHAPTER_REF;
  exports.CONFERENCE_PAPER_REF = CONFERENCE_PAPER_REF;
  exports.ChangeListTypeCommand = ChangeListTypeCommand;
  exports.ChapterRef = ChapterRef;
  exports.CheckboxInput = CheckboxInput;
  exports.ChildComponent = ChildComponent;
  exports.ChildModel = ChildModel;
  exports.CollectionComponent = CollectionComponent;
  exports.CollectionModel = CollectionModel;
  exports.ConferencePaperRef = ConferencePaperRef;
  exports.ContainerEditor = ContainerEditorNew;
  exports.ContextMenu = ContextMenu;
  exports.CreateListCommand = CreateListCommand;
  exports.CustomAbstract = CustomAbstract;
  exports.DATA_PUBLICATION_REF = DATA_PUBLICATION_REF;
  exports.DEFAULT_JATS_DTD = DEFAULT_JATS_DTD;
  exports.DEFAULT_JATS_SCHEMA_ID = DEFAULT_JATS_SCHEMA_ID;
  exports.DOIInputComponent = DOIInputComponent;
  exports.DarFileStorage = DarFileStorage;
  exports.DataPublicationRef = DataPublicationRef;
  exports.DecreaseHeadingLevelCommand = DecreaseHeadingLevelCommand;
  exports.DefaultNodeComponent = DefaultNodeComponent;
  exports.DeleteCellsCommand = DeleteCellsCommand;
  exports.DialogSectionComponent = DialogSectionComponent;
  exports.DownloadSupplementaryFileCommand = DownloadSupplementaryFileCommand;
  exports.DownloadSupplementaryFileTool = DownloadSupplementaryFileTool;
  exports.EMPTY_JATS = EMPTY_JATS;
  exports.EXTENDED_FORMATTING = EXTENDED_FORMATTING;
  exports.EditAuthorCommand = EditAuthorCommand;
  exports.EditEntityCommand = EditEntityCommand;
  exports.EditMetadataCommand = EditMetadataCommand;
  exports.EditReferenceCommand = EditReferenceCommand;
  exports.EditableAnnotationComponent = EditableAnnotationComponent;
  exports.EditableInlineNodeComponent = EditableInlineNodeComponent;
  exports.EditorBasePackage = EditorBasePackage;
  exports.EditorPanel = EditorPanel;
  exports.ExternalLink = ExternalLink;
  exports.ExternalLinkComponent = ExternalLinkComponent;
  exports.ExternalLinkEditor = ExternalLinkEditor;
  exports.FSStorage = FSStorage;
  exports.Figure = Figure;
  exports.FigureComponent = FigureComponent;
  exports.FigureLabelGenerator = FigureLabelGenerator;
  exports.FigureManager = FigureManager;
  exports.FigureMetadataComponent = FigureMetadataComponent;
  exports.FigurePanel = FigurePanel;
  exports.FigurePanelComponent = FigurePanelComponent;
  exports.FigurePanelComponentWithMetadata = FigurePanelComponentWithMetadata;
  exports.FileUploadComponent = FileUploadComponent;
  exports.Footnote = Footnote;
  exports.FootnoteComponent = FootnoteComponent;
  exports.FootnoteEditor = FootnoteEditor;
  exports.FootnoteManager = FootnoteManager;
  exports.FormRowComponent = FormRowComponent;
  exports.Funder = Funder;
  exports.Graphic = Graphic;
  exports.GraphicComponent = GraphicComponent;
  exports.Group = Group;
  exports.Heading = Heading;
  exports.HeadingComponent = HeadingComponent;
  exports.HttpStorageClient = HttpStorageClient;
  exports.INLINE_NODES = INLINE_NODES;
  exports.INTERNAL_BIBR_TYPES = INTERNAL_BIBR_TYPES;
  exports.INTERNAL_BIBR_TYPES_TO_JATS = INTERNAL_BIBR_TYPES_TO_JATS;
  exports.InMemoryDarBuffer = InMemoryDarBuffer;
  exports.IncreaseHeadingLevelCommand = IncreaseHeadingLevelCommand;
  exports.InlineFormula = InlineFormula;
  exports.InlineFormulaComponent = InlineFormulaComponent;
  exports.InlineFormulaEditor = InlineFormulaEditor;
  exports.InlineGraphic = InlineGraphic;
  exports.InlineGraphicComponent = InlineGraphicComponent;
  exports.InputWithButton = InputWithButton;
  exports.InsertBlockFormulaCommand = InsertBlockFormulaCommand;
  exports.InsertBlockQuoteCommand = InsertBlockQuoteCommand;
  exports.InsertCellsCommand = InsertCellsCommand;
  exports.InsertCrossReferenceCommand = InsertCrossReferenceCommand;
  exports.InsertExtLinkCommand = InsertExtLinkCommand;
  exports.InsertFigureCommand = InsertFigureCommand;
  exports.InsertFigurePanelTool = InsertFigurePanelTool;
  exports.InsertFigureTool = InsertFigureTool;
  exports.InsertFootnoteCommand = InsertFootnoteCommand;
  exports.InsertFootnoteCrossReferenceCommand = InsertFootnoteCrossReferenceCommand;
  exports.InsertInlineFormulaCommand = InsertInlineFormulaCommand;
  exports.InsertInlineGraphicCommand = InsertInlineGraphicCommand;
  exports.InsertInlineGraphicTool = InsertInlineGraphicTool;
  exports.InsertInlineNodeCommand = InsertInlineNodeCommand;
  exports.InsertNodeCommand = InsertNodeCommand;
  exports.InsertNodeFromWorkflowCommand = InsertNodeFromWorkflowCommand;
  exports.InsertTableCommand = InsertTableCommand;
  exports.InsertTableTool = InsertTableTool;
  exports.InternalArticleDocument = InternalArticleDocument;
  exports.IsolatedNodeComponent = IsolatedNodeComponentNew;
  exports.Italic = Italic;
  exports.ItalicComponent = ItalicComponent;
  exports.JATSTransformer = JATSTransformer;
  exports.JATS_BIBR_TYPES = JATS_BIBR_TYPES;
  exports.JATS_BIBR_TYPES_TO_INTERNAL = JATS_BIBR_TYPES_TO_INTERNAL;
  exports.JATS_GREEN_1_0_PUBLIC_ID = JATS_GREEN_1_0_PUBLIC_ID;
  exports.JATS_GREEN_1_1_PUBLIC_ID = JATS_GREEN_1_1_PUBLIC_ID;
  exports.JATS_GREEN_1_2_PUBLIC_ID = JATS_GREEN_1_2_PUBLIC_ID;
  exports.JATS_GREEN_1_DTD = JATS_GREEN_1_DTD;
  exports.JOURNAL_ARTICLE_REF = JOURNAL_ARTICLE_REF;
  exports.JournalArticleRef = JournalArticleRef;
  exports.Keyword = Keyword;
  exports.LATIN_LETTERS_LOWER_CASE = LATIN_LETTERS_LOWER_CASE;
  exports.LATIN_LETTERS_UPPER_CASE = LATIN_LETTERS_UPPER_CASE;
  exports.LICENSES = LICENSES;
  exports.LINKS_AND_XREFS = LINKS_AND_XREFS;
  exports.LabelComponent = LabelComponent;
  exports.LicenseEditor = LicenseEditor;
  exports.List = List;
  exports.ListComponent = ListComponent;
  exports.ListItem = ListItem;
  exports.ListItemComponent = ListItemComponent;
  exports.MAGAZINE_ARTICLE_REF = MAGAZINE_ARTICLE_REF;
  exports.MANUSCRIPT_MODE = MANUSCRIPT_MODE;
  exports.METADATA_MODE = METADATA_MODE;
  exports.MagazineArticleRef = MagazineArticleRef;
  exports.Managed = Managed;
  exports.ManifestLoader = ManifestLoader;
  exports.ManuscriptComponent = ManuscriptComponent;
  exports.ManuscriptEditor = ManuscriptEditor;
  exports.ManuscriptSection = ManuscriptSection;
  exports.ManuscriptTOC = ManuscriptTOC;
  exports.ManyRelationshipComponent = ManyRelationshipComponent;
  exports.ManyRelationshipModel = ManyRelationshipModel;
  exports.Metadata = Metadata;
  exports.MetadataField = MetadataField;
  exports.MetadataFieldComponent = MetadataFieldComponent;
  exports.ModalDialog = ModalDialog;
  exports.ModelComponent = ModelComponent;
  exports.ModelComponentPackage = ModelComponentPackage;
  exports.ModelPreviewComponent = ModelPreviewComponent;
  exports.Monospace = Monoscript;
  exports.MoveFigurePanelCommand = MoveFigurePanelCommand;
  exports.MoveMetadataFieldCommand = MoveMetadataFieldCommand;
  exports.MultiSelectInput = MultiSelectInput;
  exports.NEWSPAPER_ARTICLE_REF = NEWSPAPER_ARTICLE_REF;
  exports.NewspaperArticleRef = NewspaperArticleRef;
  exports.NodeComponent = NodeComponent;
  exports.NodeComponentMixin = NodeComponentMixin;
  exports.NodeOverlayEditorMixin = NodeOverlayEditorMixin;
  exports.NumberedLabelGenerator = NumberedLabelGenerator;
  exports.ObjectComponent = ObjectComponent;
  exports.ObjectModel = ObjectModel;
  exports.OpenFigurePanelImageCommand = OpenFigurePanelImageCommand;
  exports.OpenFigurePanelImageTool = OpenFigurePanelImageTool;
  exports.OverlayCanvas = OverlayCanvas;
  exports.OverlayMixin = OverlayMixin;
  exports.Overline = Overline;
  exports.PATENT_REF = PATENT_REF;
  exports.PREVIEW_MODE = PREVIEW_MODE;
  exports.Paragraph = Paragraph;
  exports.ParagraphComponent = ParagraphComponent;
  exports.PatentRef = PatentRef;
  exports.Permission = Permission;
  exports.PersistedDocumentArchive = PersistedDocumentArchive;
  exports.Person = Person;
  exports.PinnedMessage = PinnedMessage;
  exports.Preformat = Preformat;
  exports.PreviewComponent = PreviewComponent;
  exports.QueryComponent = QueryComponent;
  exports.REF_TYPES = REF_TYPES;
  exports.REPORT_REF = REPORT_REF;
  exports.RICH_TEXT_ANNOS = RICH_TEXT_ANNOS;
  exports.ROMAN_NUMBERS = ROMAN_NUMBERS;
  exports.RefContrib = RefContrib;
  exports.Reference = Reference;
  exports.ReferenceComponent = ReferenceComponent;
  exports.ReferenceListComponent = ReferenceListComponent;
  exports.ReferenceManager = ReferenceManager;
  exports.ReferenceUploadComponent = ReferenceUploadComponent;
  exports.RemoveFigurePanelCommand = RemoveFigurePanelCommand;
  exports.RemoveFootnoteCommand = RemoveFootnoteCommand;
  exports.RemoveItemCommand = RemoveItemCommand;
  exports.RemoveMetadataFieldCommand = RemoveMetadataFieldCommand;
  exports.RemoveReferenceCommand = RemoveReferenceCommand;
  exports.ReplaceFigurePanelImageCommand = ReplaceFigurePanelImageCommand;
  exports.ReplaceFigurePanelTool = ReplaceFigurePanelTool;
  exports.ReplaceSupplementaryFileCommand = ReplaceSupplementaryFileCommand;
  exports.ReplaceSupplementaryFileTool = ReplaceSupplementaryFileTool;
  exports.ReportRef = ReportRef;
  exports.SOFTWARE_REF = SOFTWARE_REF;
  exports.SYMBOLS = SYMBOLS;
  exports.ScrollPane = ScrollPane;
  exports.SectionLabel = SectionLabel;
  exports.SingleRelationshipComponent = SingleRelationshipComponent;
  exports.SingleRelationshipModel = SingleRelationshipModel;
  exports.SmallCaps = SmallCaps;
  exports.SoftwareRef = SoftwareRef;
  exports.StrikeThrough = StrikeThrough;
  exports.StringComponent = StringComponent;
  exports.StringModel = StringModel;
  exports.Subject = Subject;
  exports.Subscript = Subscript;
  exports.SubscriptComponent = SubscriptComponent;
  exports.Superscript = Superscript;
  exports.SuperscriptComponent = SuperscriptComponent;
  exports.SupplementaryFile = SupplementaryFile;
  exports.SupplementaryFileComponent = SupplementaryFileComponent;
  exports.SupplementaryFileUploadComponent = SupplementaryFileUploadComponent;
  exports.Surface = SurfaceNew;
  exports.TEXTURE_JATS_DTD = TEXTURE_JATS_DTD;
  exports.TEXTURE_JATS_PUBLIC_ID = TEXTURE_JATS_PUBLIC_ID;
  exports.THESIS_REF = THESIS_REF;
  exports.Table = Table;
  exports.TableCell = TableCell;
  exports.TableCellComponent = TableCellComponent;
  exports.TableCellEditor = TableCellEditor;
  exports.TableComponent = TableComponent;
  exports.TableContextMenu = TableContextMenu;
  exports.TableFigure = TableFigure;
  exports.TableFigureComponent = TableFigureComponent;
  exports.TableFigureComponentWithMetadata = TableFigureComponentWithMetadata;
  exports.TableManager = TableManager;
  exports.TableRow = TableRow;
  exports.TableSelectAllCommand = TableSelectAllCommand;
  exports.TextComponent = TextComponent;
  exports.TextInput = TextInput;
  exports.TextModel = TextModel;
  exports.TextNodeComponent = TextNodeComponent;
  exports.TextPropertyEditor = TextPropertyEditorNew;
  exports.Texture = Texture;
  exports.TextureAppChrome = TextureAppChrome;
  exports.TextureArchive = TextureArchive;
  exports.TextureConfigurator = TextureConfigurator;
  exports.TextureDesktopApp = TextureDesktopApp;
  exports.TextureDesktopAppChrome = TextureDesktopAppChrome;
  exports.TextureJATS = TextureJATS;
  exports.TextureWebApp = TextureWebApp;
  exports.TextureWebAppChrome = TextureWebAppChrome;
  exports.ThesisRef = ThesisRef;
  exports.ToggleCellHeadingCommand = ToggleCellHeadingCommand;
  exports.ToggleCellMergeCommand = ToggleCellMergeCommand;
  exports.ToggleListCommand = ToggleListCommand;
  exports.ToggleTool = ToggleTool;
  exports.Tool = Tool;
  exports.ToolDropdown = ToolDropdown;
  exports.ToolGroup = ToolGroup;
  exports.ToolPanel = ToolPanel;
  exports.ToolSpacer = ToolSpacer;
  exports.Toolbar = Toolbar;
  exports.Tooltip = Tooltip;
  exports.Underline = Underline;
  exports.UnpackedDarFolderStorage = UnpackedDarFolderStorage;
  exports.UnsupportedInlineNode = UnsupportedInlineNode;
  exports.UnsupportedInlineNodeComponent = UnsupportedInlineNodeComponent;
  exports.UnsupportedNode = UnsupportedNode;
  exports.UnsupportedNodeComponent = UnsupportedNodeComponent;
  exports.UploadSingleImageTool = UploadSingleImageTool;
  exports.UploadTool = UploadTool;
  exports.ValueComponent = ValueComponent;
  exports.ValueModel = ValueModel;
  exports.Vfs = Vfs;
  exports.VfsStorageClient = VfsStorageClient;
  exports.WEBPAGE_REF = WEBPAGE_REF;
  exports.WebpageRef = WebpageRef;
  exports.XREF_TARGET_TYPES = XREF_TARGET_TYPES;
  exports.Xref = Xref;
  exports.XrefComponent = XrefComponent;
  exports.XrefEditor = XrefEditor;
  exports.addModelObserver = addModelObserver;
  exports.checkArchive = checkLoadArchive;
  exports.cloneArchive = cloneArchive;
  exports.convertCSLJSON = convertCSLJSON;
  exports.createDemoVfs = createDemoVfs;
  exports.createEmptyJATS = createEmptyJATS;
  exports.createJatsExporter = createJatsExporter;
  exports.createJatsImporter = createJatsImporter;
  exports.createNodePropertyModels = createNodePropertyModels;
  exports.createValueModel = createValueModel;
  exports.findAllChildren = findAllChildren;
  exports.findChild = findChild;
  exports.findParentByType = findParentByType;
  exports.getAttr = getAttr;
  exports.getComponentForModel = getComponentForModel;
  exports.getLabel = getLabel;
  exports.getPos = getPos;
  exports.getSeparatedText = getSeparatedText;
  exports.getText = getText;
  exports.getXrefLabel = getXrefLabel;
  exports.getXrefTargets = getXrefTargets;
  exports.ifNodeOrRelatedHasChanged = ifNodeOrRelatedHasChanged;
  exports.importFigures = importFigures;
  exports.internal2jats = internal2jats;
  exports.jats2internal = jats2internal;
  exports.printElement = printElement;
  exports.readArchive = readArchive;
  exports.removeModelObserver = removeModelObserver;
  exports.renderModel = renderModel;
  exports.renderNode = renderNode;
  exports.renderValue = renderValue;
  exports.retainChildren = retainChildren;
  exports.tableHelpers = tableHelpers;
  exports.textureGlobals = textureGlobals;
  exports.throwMethodIsAbstract = throwMethodIsAbstract;
  exports.updateEntityChildArray = updateEntityChildArray;
  exports.vfsSaveHook = vfsSaveHook;
  exports.writeArchive = writeArchive;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=texture.js.map
