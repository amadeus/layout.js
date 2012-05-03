(function(){

// Generic stopPropagation - may not need this
var stopPropagation = function(e){ e.stopPropagation(); },
	preventDefault  = function(e){ e.preventDefault(); },
	EDIT            = 'edit',
	STATIC          = 'static';


// Base layout class, controls everything
var Layout = window.Layout = new Class({

	Implements: [Options, Events, Class.Binds],

	options: {
		// Pixel snap for Units
		snap: 20,
		// Min size of Unit in pixels - gets passed to Unit instances
		minSize: 200,
		// Max size of Unit in pixels - gets passed to Unit instances
		maxSize: 2000,

		editClass: 'editable',

		unitClass: 'layout-unit',
		unitDestroyClass: 'unit-destroy',
		unitResizeClass: 'unit-resize',
		unitDraggedClass: 'dragging',

		unitIdPrefix: 'unit-'
	},

	units: [],
	editable: false,

	containerOffset: {
		x: 0,
		y: 0
	},

	initialize: function(container, options){
		this.container = document.id(container);
		this.setOptions(options);
		this.updateContainerOffset();
	},

	getUnit: function(id){
		var unit = null;

		this.units.each(function(u){
			if (u.options.id === id) unit = u;
		}, this);

		return unit;
	},

	setEditable: function(bool){
		if ((bool && this.editable) || (!bool && !this.editable)) return this;

		if (bool){
			this.container.addClass(this.options.editClass);
			this._attach();
			this.editable = true;
		} else {
			this.container.removeClass(this.options.editClass);
			this._detach();
			this.editable = false;
		}

		return this;
	},

	updateContainerOffset: function(){
		this.containerOffset = this.container.getPosition(document.body);
	},

	// Add a new Unit with options passed in, and store a reference in this.units
	addUnit: function(options){
		var opts = this.options, unit;

		options.onDestroy    = this.bound('removeUnit');
		options.onResizeEnd  = this.bound('_handleUnitResizeEnd');
		options.onMoveEnd    = this.bound('_handleUnitMoveEnd');
		options.minSize      = opts.minSize;
		options.maxSize      = opts.maxSize;
		options.maxSize      = opts.maxSize;
		options.unitIdPrefix = opts.unitIdPrefix;

		unit = new Unit(this.container, options, this.containerOffset);
		if (this.editable) unit.attach();
		this.units.push(unit);
		this.fireEvent('addUnit', [unit, this]);
		return this;
	},

	removeUnit: function(unit){
		var i = this.units.indexOf(unit);
		if (i > -1){
			this.units.splice(i, 1);
			this.fireEvent('removeUnit', [unit, this]);
		}
		return this;
	},

	clearLayout: function(){
		while(this.units.length)
			this.units[0].destroy();
		this.fireEvent('clearLayout', this);
		return this;
	},

	loadLayout: function(layout){
		if (typeOf(layout) !== 'array') throw new Error('Layout: Not a valid layout');
		this.clearLayout();
		layout.each(function(options){
			this.addUnit(options);
		}, this);

		this.fireEvent('loadLayout', [this.units, this]);
		return this;
	},

	getLayout: function(){
		var scene = [],
			getSceneInfo = function(instance){
				var unit = {
					id         : instance.options.id,
					coords     : {
						top    : instance.options.coords.top,
						left   : instance.options.coords.left,
						width  : instance.options.coords.width,
						height : instance.options.coords.height
					}
				};

				scene.push(unit);
			};

		this.units.each(getSceneInfo);

		return scene;
	},

	_attach: function(){
		// Add double click event handler
		this.container.addEvents({
			'mousedown': preventDefault,
			'dblclick': this.bound('_handleDoubleClick')
		});

		this.units.invoke('attach');
	},

	_detach: function(){
		this.container.removeEvents({
			'mousedown': preventDefault,
			'dblclick': this.bound('_handleDoubleClick')
		});

		this.units.invoke('detach');
	},

	_handleUnitResizeEnd: function(unit){
		this.fireEvent('resizeUnit', [unit, this]);
	},

	_handleUnitMoveEnd: function(unit){
		this.fireEvent('moveUnit', [unit, this]);
	},

	_handleDoubleClick: function(e){
		// Offset the pointer coords to center the new Unit under the cursor
		var opts = this.options,
			y = e.page.y - this.containerOffset.y - (opts.minSize / 2),
			x = e.page.x - this.containerOffset.x - (opts.minSize / 2);

		// Ensure that the Unit is not outside the container
		x = x - (x % opts.snap);
		y = y - (y % opts.snap);

		if (x < opts.snap) x = opts.snap;
		if (y < opts.snap) y = opts.snap;

		// Add a unit with the following coords
		this.addUnit({
			id: String.uniqueID(),
			snap: opts.snap,
			coords: {
				top: y,
				left: x
			}
		});
	}

});

var Unit = window.Layout.Unit = new Class({

	Implements: [Options, Events, Class.Binds],

	options: {
		// Unique ID for Unit. Can be used to select the unit from Layout class
		id: null,
		// Min pixels to snap the Unit too
		snap: 20,
		// Min size of Unit in pixels
		minSize: 200,
		// Max size of Unit in pixels
		maxSize: 800,
		// Initial CSS coords of Unit
		coords: {
			top: 0,
			left: 0,
			width: 200,
			height: 200
		},

		unitClass: 'layout-unit',
		unitDestroyClass: 'unit-destroy',
		unitResizeClass: 'unit-resize',
		unitDraggedClass: 'dragging',

		unitIdPrefix: 'unit-'
	},

	// Current mode of Unit. Can be: display, move, resize
	mode: 'display',

	// Offsets used for resizing and dragging
	_dragOffset: {
		x: 0,
		y: 0
	},

	containerOffset: {
		x: 0,
		y: 0
	},

	initialize: function(container, options, containerOffset){
		this.container = document.id(container);
		this.setOptions(options);
		if (containerOffset)
			this.containerOffset = containerOffset;

		// Create element container
		this.element = new Element('div', {
			id: this.options.unitIdPrefix + this.options.id,
			'class': this.options.unitClass,
			styles: this.options.coords
		});

		this.element.setStyles({
			position: 'absolute'
		});

		// Create resize controller
		this.resize = new Element('div', {
			'class': this.options.unitResizeClass,
			events: {
				'mousedown': this.bound('_handleResizeDown')
			}
		});

		// Create delete element
		this.remove = new Element('div', {
			'class': this.options.unitDestroyClass,
			events: {
				'click': this.bound('_handleDestroy'),
				'mousedown': stopPropagation // This protects remove from triggering drag
			}
		});

		// Kicking shit off by injecting the element into supplied container
		this.element.inject(this.container);
	},

	attach: function(){
		this.element
			.addEvents({
				'dblclick': stopPropagation,
				'mousedown': this.bound('_handleMoveStart')
			});

		this.resize.inject(this.element);
		this.remove.inject(this.element);
	},

	detach: function(){
		this.element
			.removeEvents({
				'dblclick': stopPropagation,
				'mousedown': this.bound('_handleMoveStart')
			});

		this.resize.dispose(this.element);
		this.remove.dispose(this.element);
	},

	// Allows element to be selected when passing instance into document.id()
	toElement: function(){
		return this.element;
	},

	destroy: function(){
		this.element.destroy();
		this.fireEvent('destroy', this);
	},

	// Destroy's unit, needs work
	_handleDestroy: function(e){
		e.stopPropagation();
		this.destroy();
	},

	_handleMoveStart: function(e){
		// Setup dragOffset to be position of pointer relative to container
		var pointer = Unit.round(e.page, this.options.snap, false),
			element = Unit.round(this.element.getPosition(this.container), this.options.snap, false);

		this._dragOffset = {
			x: pointer.x - element.x,
			y: pointer.y - element.y
		};

		this.mode = 'move';
		this.element.addClass(this.options.unitDraggedClass);

		this.container.addEvents({
			'mousemove': this.bound('_handleMove'),
			'mouseup': this.bound('_handleUp')
		});

		e.stopPropagation();
	},

	_handleResizeDown: function(e){
		// Set dragOffset to be the position of the element
		this._dragOffset = Unit.round(this.element.getPosition(this.container), this.options.snap, false);

		this.mode = 'resize';

		this.container.addEvents({
			'mousemove': this.bound('_handleMove'),
			'mouseup': this.bound('_handleUp')
		});

		e.stopPropagation();
	},

	_handleMove: function(e){
		// Round pointer coordinates, if it's resize we need to round up
		var opts = this.options,
			coords = Unit.round(e.page, opts.snap, this.mode === 'resize'),
			styles;

		// Subtract offset
		coords.x -= this._dragOffset.x;
		coords.y -= this._dragOffset.y;

		// Move Mode: Ensure element doesn't outside bounds
		if (this.mode === 'move'){
			if (coords.x < opts.snap) coords.x = opts.snap;
			if (coords.y < opts.snap) coords.y = opts.snap;

			// Set top and left positioning
			opts.coords.top = coords.y;
			opts.coords.left = coords.x;

			styles = {
				top: coords.y,
				left: coords.x
			};
		}
		// Resize Mode: Ensure element is within min/max size
		if (this.mode === 'resize'){
			coords.x -= this.containerOffset.x;
			coords.y -= this.containerOffset.y;
			if (coords.x < opts.minSize) coords.x = opts.minSize;
			if (coords.y < opts.minSize) coords.y = opts.minSize;

			if (coords.x > opts.maxSize) coords.x = opts.maxSize;
			if (coords.y > opts.maxSize) coords.y = opts.maxSize;

			// Set width and height after it's been clamped
			opts.coords.height = coords.y;
			opts.coords.width = coords.x;

			styles = {
				width: coords.x,
				height: coords.y
			};
		}

		// Update element
		this.element.setStyles(styles);
	},

	_handleUp: function(){
		// Remove move and up events
		if (this.mode === 'resize') this.fireEvent('resizeEnd', this);
		if (this.mode === 'move') this.fireEvent('moveEnd', this);

		this.mode = 'display';
		this.element.removeClass(this.options.unitDraggedClass);
		this.container
			.removeEvent('mousemove', this.bound('_handleMove'))
			.removeEvent('mouseup', this.bound('_handleUp'));
	}

});

Unit.extend({

	// Duplicate and round coords up or down based on snap
	round: function(page, snap, roundUp){
		var coords = {
				x: page.x,
				y: page.y
			},
			moduloX = coords.x % snap,
			moduloY = coords.y % snap;

		coords.x += (roundUp) ? snap - moduloX : -moduloX;
		coords.y += (roundUp) ? snap - moduloY : -moduloY;

		return coords;
	}

});

}).call(this);
