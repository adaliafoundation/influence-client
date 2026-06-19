/**
 * Modified from example at:
 * https://raw.githubusercontent.com/mrdoob/three.js/master/examples/js/controls/TrackballControls.js
 *
 * Translates the "scene" object when panning or zooming rather than moving the camera. This aids
 * in avoiding precision issues by keeping the focus at origin.
 */
import { EventDispatcher, Quaternion, Vector2, Vector3 } from 'three';

/* eslint-disable */
const TrackballModControls = function (object, domElement) {
  var _this = this;
  var STATE = {
    NONE: - 1,
    ROTATE: 0,
    ZOOM: 1,
    PAN: 2,
    TOUCH_ROTATE: 3,
    TOUCH_ZOOM_PAN: 4
  };

  this.object = object;
  this.domElement = (domElement !== undefined) ? domElement : document;

  // API
  this.enabled = true;
  this.screen = { left: 0, top: 0, width: 0, height: 0 };
  this.rotateSpeed = 1.0;
  this.zoomSpeed = 1.2;
  this.panSpeed = 0.8;
  this.noRotate = false;
  this.noZoom = false;
  this.noPan = false;
  this.staticMoving = true;
  this.dynamicDampingFactor = 0.3;
  this.minDistance = 0;
  this.maxDistance = Infinity;
  this.keys = [ 65 /*A*/, 83 /*S*/, 68 /*D*/ ];

  // internals
  this.target = new Vector3();
  var EPS = 0.000001;
  var lastPosition = new Vector3();
  var lastScenePosition = new Vector3();
  var _state = STATE.NONE,
  _prevState = STATE.NONE,
  _activePointerId = null,
  _eye = new Vector3(),
  _movePrev = new Vector2(),
  _moveCurr = new Vector2(),
  _lastAxis = new Vector3(),
  _lastAngle = 0,
  _zoomStart = new Vector2(),
  _zoomEnd = new Vector2(),
  _touchZoomDistanceStart = 0,
  _touchZoomDistanceEnd = 0,
  _panStart = new Vector2(),
  _panEnd = new Vector2();

  // events
  var changeEvent = { type: 'change' };
  var startEvent = { type: 'start' };
  var endEvent = { type: 'end' };

  const eventHandlers = {
    contextmenu,
    pointerdown,
    pointermove,
    pointerup,
    pointercancel,
    mousedown,
    mouseleave,
    mouseup,
    mousemove,
    wheel: mousewheel,
    touchstart,
    touchmove,
    keydown,
    keyup
  };
  const hasPointerEvents = typeof window !== 'undefined' && 'PointerEvent' in window;
  const wheelListenerOptions = { passive: true };

  const eventHandler = (event) => {
    if (eventHandlers[event.type]) {
      eventHandlers[event.type](event);
      _this.dispatchEvent(changeEvent);
    }
  };

  // methods
  this.attach = function (scene) {
    this.targetScene = scene;

    // for reset
    this.target0 = this.target.clone();
    this.position0 = this.object.position.clone();
    this.up0 = this.object.up.clone();
    this.targetScene0 = this.targetScene.position.clone();

    // Listeners
    this.domElement.addEventListener('contextmenu', eventHandler, false);
    if (hasPointerEvents) {
      this.domElement.addEventListener('pointerdown', eventHandler, false);
    } else {
      this.domElement.addEventListener('mousedown', eventHandler, false);
    }
    this.domElement.addEventListener('wheel', eventHandler, wheelListenerOptions);
    this.domElement.addEventListener('touchstart', eventHandler, false);
    this.domElement.addEventListener('touchend', eventHandler, false);
    this.domElement.addEventListener('touchmove', eventHandler, false);
    window.addEventListener('keydown', eventHandler, false);
    window.addEventListener('keyup', eventHandler, false);

    this.handleResize();

    // force an update at start
    this.update();
  };

  this.handleResize = function () {
    if (this.domElement === document) {
      this.screen.left = 0;
      this.screen.top = 0;
      this.screen.width = window.innerWidth;
      this.screen.height = window.innerHeight;
    } else {
      var box = this.domElement.getBoundingClientRect();

      // adjustments come from similar code in the jquery offset() function
      var d = this.domElement.ownerDocument.documentElement;
      this.screen.left = box.left + window.pageXOffset - d.clientLeft;
      this.screen.top = box.top + window.pageYOffset - d.clientTop;
      this.screen.width = box.width;
      this.screen.height = box.height;
    }
  };

  var getMouseOnScreen = (function () {
    var vector = new Vector2();

    return function getMouseOnScreen(pageX, pageY) {
      vector.set(
        (pageX - _this.screen.left) / _this.screen.width,
        (pageY - _this.screen.top) / _this.screen.height
      );

      return vector;
    };
  }());

  var getMouseOnCircle = (function () {
    var vector = new Vector2();

    return function getMouseOnCircle(pageX, pageY) {
      vector.set(
        ((pageX - _this.screen.width * 0.5 - _this.screen.left) / (_this.screen.width * 0.5)),
        ((_this.screen.height + 2 * (_this.screen.top - pageY)) / _this.screen.width) // screen.width intentional
      );

      return vector;
    };
  }());

  this.rotateCamera = (function() {
    var axis = new Vector3(),
      quaternion = new Quaternion(),
      eyeDirection = new Vector3(),
      objectUpDirection = new Vector3(),
      objectSidewaysDirection = new Vector3(),
      moveDirection = new Vector3(),
      angle;

    return function rotateCamera() {
      moveDirection.set(_moveCurr.x - _movePrev.x, _moveCurr.y - _movePrev.y, 0);
      angle = moveDirection.length();

      if (angle) {
        _eye.copy(_this.object.position).sub(_this.target);
        eyeDirection.copy(_eye).normalize();
        objectUpDirection.copy(_this.object.up).normalize();
        objectSidewaysDirection.crossVectors(objectUpDirection, eyeDirection).normalize();
        objectUpDirection.setLength(_moveCurr.y - _movePrev.y);
        objectSidewaysDirection.setLength(_moveCurr.x - _movePrev.x);
        moveDirection.copy(objectUpDirection.add(objectSidewaysDirection));
        axis.crossVectors(moveDirection, _eye).normalize();
        angle *= _this.rotateSpeed;
        quaternion.setFromAxisAngle(axis, angle).normalize();
        _eye.applyQuaternion(quaternion);
        _this.object.up.applyQuaternion(quaternion);
        _lastAxis.copy(axis);
        _lastAngle = angle;
      } else if (! _this.staticMoving && _lastAngle) {
        _lastAngle *= Math.sqrt(1.0 - _this.dynamicDampingFactor);
        _eye.copy(_this.object.position).sub(_this.target);
        quaternion.setFromAxisAngle(_lastAxis, _lastAngle).normalize();
        _eye.applyQuaternion(quaternion);
        _this.object.up.applyQuaternion(quaternion);
      }

      _movePrev.copy(_moveCurr);
    };
  }());

  this.zoomCamera = function () {
    var factor;

    if (_state === STATE.TOUCH_ZOOM_PAN) {
      factor = _touchZoomDistanceStart / _touchZoomDistanceEnd;
      _touchZoomDistanceStart = _touchZoomDistanceEnd;
      _eye.multiplyScalar(factor);
    } else if (_zoomEnd.y !== _zoomStart.y) {
      factor = 1.0 + (_zoomEnd.y - _zoomStart.y) * _this.zoomSpeed;

      if (factor !== 1.0 && factor > 0.0) {
        _eye.multiplyScalar(factor);
      }

      if (_this.staticMoving) {
        _zoomStart.copy(_zoomEnd);
      } else {
        _zoomStart.y += (_zoomEnd.y - _zoomStart.y) * this.dynamicDampingFactor;
      }
    }
  };

  this.panCamera = (function() {
    var mouseChange = new Vector2(),
      objectUp = new Vector3(),
      pan = new Vector3();

    return function panCamera() {
      mouseChange.copy(_panEnd).sub(_panStart);

      if (mouseChange.lengthSq()) {
        mouseChange.multiplyScalar(_eye.length() * _this.panSpeed);
        pan.copy(_eye).cross(_this.object.up).setLength(mouseChange.x);
        pan.add(objectUp.copy(_this.object.up).setLength(mouseChange.y));

        // Pans the passed scene object instead of the camera to maximize precision at target
        _this.targetScene.position.sub(pan);

        if (_this.staticMoving) {
          _panStart.copy(_panEnd);
        } else {
          _panStart.add(mouseChange.subVectors(_panEnd, _panStart).multiplyScalar(_this.dynamicDampingFactor));
        }
      }
    };
  }());

  this.checkDistances = function () {
    if (! _this.noZoom || ! _this.noPan) {
      if (_eye.lengthSq() > _this.maxDistance * _this.maxDistance) {
        _this.object.position.addVectors(_this.target, _eye.setLength(_this.maxDistance));
        _zoomStart.copy(_zoomEnd);
      }

      if (_eye.lengthSq() < _this.minDistance * _this.minDistance) {
        _this.object.position.addVectors(_this.target, _eye.setLength(_this.minDistance));
        _zoomStart.copy(_zoomEnd);
      }
    }
  };

  this.update = function () {
    _eye.subVectors(_this.object.position, _this.target);

    if (! _this.noRotate) {
      _this.rotateCamera();
    }

    if (! _this.noZoom) {
      _this.zoomCamera();
    }

    if (! _this.noPan) {
      _this.panCamera();
    }

    _this.object.position.addVectors(_this.target, _eye);
    _this.checkDistances();
    _this.object.lookAt(_this.target);

    if (lastPosition.distanceToSquared(_this.object.position) > EPS) {
      _this.dispatchEvent(changeEvent);
      lastPosition.copy(_this.object.position);
    }

    if (lastScenePosition.distanceToSquared(_this.targetScene.position) > EPS) {
      _this.dispatchEvent(changeEvent);
      lastScenePosition.copy(_this.targetScene.position);
    }
  };

  this.reset = function () {
    _state = STATE.NONE;
    _prevState = STATE.NONE;
    _this.target.copy(_this.target0);
    _this.object.position.copy(_this.position0);
    _this.object.up.copy(_this.up0);
    _eye.subVectors(_this.object.position, _this.target);
    _this.object.lookAt(_this.target);
    _this.targetScene.position.copy(_this.targetScene0);
    _this.dispatchEvent(changeEvent);
    lastPosition.copy(_this.object.position);
    lastScenePosition.copy(_this.targetScene.position);
  };

  // listeners
  function keydown(event) {
    if (_this.enabled === false) return;
    window.removeEventListener('keydown', keydown);
    _prevState = _state;

    if (_state !== STATE.NONE) {
      return;
    } else if (event.keyCode === _this.keys[ STATE.ROTATE ] && ! _this.noRotate) {
      _state = STATE.ROTATE;
    } else if (event.keyCode === _this.keys[ STATE.ZOOM ] && ! _this.noZoom) {
      _state = STATE.ZOOM;
    } else if (event.keyCode === _this.keys[ STATE.PAN ] && ! _this.noPan) {
      _state = STATE.PAN;
    }
  }

  function keyup(event) {
    if (_this.enabled === false) return;
    _state = _prevState;
    window.addEventListener('keydown', eventHandler, false);
  }

  function mousedown(event) {
    if (_this.enabled === false) return;
    _this.handleResize();
    event.preventDefault();
    event.stopPropagation();

    if (_state === STATE.NONE) {
      _state = event.button;
    }

    if (_state === STATE.ROTATE && ! _this.noRotate) {
      _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));
      _movePrev.copy(_moveCurr);
    } else if (_state === STATE.ZOOM && ! _this.noZoom) {
      _zoomStart.copy(getMouseOnScreen(event.pageX, event.pageY));
      _zoomEnd.copy(_zoomStart);
    } else if (_state === STATE.PAN && ! _this.noPan) {
      _panStart.copy(getMouseOnScreen(event.pageX, event.pageY));
      _panEnd.copy(_panStart);
    }

    _this.domElement.addEventListener('mousemove', eventHandler, false);
    _this.domElement.addEventListener('mouseleave', eventHandler, false);
    _this.domElement.addEventListener('mouseup', eventHandler, false);
    _this.dispatchEvent(startEvent);
  }

  function pointerdown(event) {
    if (_this.enabled === false) return;
    if (event.pointerType === 'touch') return;
    if (_activePointerId !== null) return;

    _this.handleResize();

    _activePointerId = event.pointerId;

    if (_state === STATE.NONE) {
      _state = event.button;
    }

    if (_state === STATE.ROTATE && ! _this.noRotate) {
      _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));
      _movePrev.copy(_moveCurr);
    } else if (_state === STATE.ZOOM && ! _this.noZoom) {
      _zoomStart.copy(getMouseOnScreen(event.pageX, event.pageY));
      _zoomEnd.copy(_zoomStart);
    } else if (_state === STATE.PAN && ! _this.noPan) {
      _panStart.copy(getMouseOnScreen(event.pageX, event.pageY));
      _panEnd.copy(_panStart);
    }

    if (_this.domElement.setPointerCapture) {
      _this.domElement.setPointerCapture(_activePointerId);
    }

    _this.domElement.addEventListener('pointermove', eventHandler, false);
    _this.domElement.addEventListener('pointerup', eventHandler, false);
    _this.domElement.addEventListener('pointercancel', eventHandler, false);
    _this.dispatchEvent(startEvent);
  }

  function mousemove(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();

    if (_state === STATE.ROTATE && ! _this.noRotate) {
      _movePrev.copy(_moveCurr);
      _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));
    } else if (_state === STATE.ZOOM && ! _this.noZoom) {
      _zoomEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
    } else if (_state === STATE.PAN && ! _this.noPan) {
      _panEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
    }
  }

  function pointermove(event) {
    if (_this.enabled === false) return;
    if (event.pointerId !== _activePointerId) return;

    if (_state === STATE.ROTATE && ! _this.noRotate) {
      _movePrev.copy(_moveCurr);
      _moveCurr.copy(getMouseOnCircle(event.pageX, event.pageY));
    } else if (_state === STATE.ZOOM && ! _this.noZoom) {
      _zoomEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
    } else if (_state === STATE.PAN && ! _this.noPan) {
      _panEnd.copy(getMouseOnScreen(event.pageX, event.pageY));
    }
  }

  function mouseup(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();
    _state = STATE.NONE;
    _this.domElement.removeEventListener('mousemove', eventHandler);
    _this.domElement.removeEventListener('mouseleave', eventHandler);
    _this.domElement.removeEventListener('mouseup', eventHandler);
    _this.dispatchEvent(endEvent);
  }

  function pointerup(event) {
    if (_this.enabled === false) return;
    if (event.pointerId !== _activePointerId) return;

    _state = STATE.NONE;
    if (_this.domElement.releasePointerCapture && _activePointerId !== null) {
      try {
        _this.domElement.releasePointerCapture(_activePointerId);
      } catch (e) {}
    }
    _activePointerId = null;
    _this.domElement.removeEventListener('pointermove', eventHandler);
    _this.domElement.removeEventListener('pointerup', eventHandler);
    _this.domElement.removeEventListener('pointercancel', eventHandler);
    _this.dispatchEvent(endEvent);
  }

  function pointercancel(event) {
    pointerup(event);
  }

  function mouseleave(event) {
    mouseup(event);
  }

  function mousewheel(event) {
    if (_this.enabled === false) return;
    event.stopPropagation();

    switch (event.deltaMode) {
      case 2:
        // Zoom in pages
        _zoomStart.y -= event.deltaY * 0.025;
        break;

      case 1:
        // Zoom in lines
        _zoomStart.y -= event.deltaY * 0.01;
        break;

      default:
        // undefined, 0, assume pixels
        _zoomStart.y -= event.deltaY * 0.00025;
        break;
    }

    _this.dispatchEvent(startEvent);
    _this.dispatchEvent(endEvent);
  }

  function touchstart(event) {
    if (_this.enabled === false) return;
    _this.handleResize();

    switch (event.touches.length) {
      case 1:
        _state = STATE.TOUCH_ROTATE;
        _moveCurr.copy(getMouseOnCircle(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY));
        _movePrev.copy(_moveCurr);
        break;

      default: // 2 or more
        _state = STATE.TOUCH_ZOOM_PAN;
        var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
        var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
        _touchZoomDistanceEnd = _touchZoomDistanceStart = Math.sqrt(dx * dx + dy * dy);
        var x = (event.touches[ 0 ].pageX + event.touches[ 1 ].pageX) / 2;
        var y = (event.touches[ 0 ].pageY + event.touches[ 1 ].pageY) / 2;
        _panStart.copy(getMouseOnScreen(x, y));
        _panEnd.copy(_panStart);
        break;
    }

    _this.dispatchEvent(startEvent);
  }

  function touchmove(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
    event.stopPropagation();

    switch (event.touches.length) {
      case 1:
        _movePrev.copy(_moveCurr);
        _moveCurr.copy(getMouseOnCircle(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY));
        break;

      default: // 2 or more
        var dx = event.touches[ 0 ].pageX - event.touches[ 1 ].pageX;
        var dy = event.touches[ 0 ].pageY - event.touches[ 1 ].pageY;
        _touchZoomDistanceEnd = Math.sqrt(dx * dx + dy * dy);
        var x = (event.touches[ 0 ].pageX + event.touches[ 1 ].pageX) / 2;
        var y = (event.touches[ 0 ].pageY + event.touches[ 1 ].pageY) / 2;
        _panEnd.copy(getMouseOnScreen(x, y));
        break;
    }
  }

  function touchend(event) {
    if (_this.enabled === false) return;

    switch (event.touches.length) {
      case 0:
        _state = STATE.NONE;
        break;

      case 1:
        _state = STATE.TOUCH_ROTATE;
        _moveCurr.copy(getMouseOnCircle(event.touches[ 0 ].pageX, event.touches[ 0 ].pageY));
        _movePrev.copy(_moveCurr);
        break;
    }

    _this.dispatchEvent(endEvent);
  }

  function contextmenu(event) {
    if (_this.enabled === false) return;
    event.preventDefault();
  }

  this.dispose = function() {
    this.domElement.removeEventListener('contextmenu', eventHandler, false);
    this.domElement.removeEventListener('pointerdown', eventHandler, false);
    this.domElement.removeEventListener('pointermove', eventHandler, false);
    this.domElement.removeEventListener('pointerup', eventHandler, false);
    this.domElement.removeEventListener('pointercancel', eventHandler, false);
    this.domElement.removeEventListener('mousedown', eventHandler, false);
    this.domElement.removeEventListener('wheel', eventHandler, wheelListenerOptions);
    this.domElement.removeEventListener('touchstart', eventHandler, false);
    this.domElement.removeEventListener('touchend', eventHandler, false);
    this.domElement.removeEventListener('touchmove', eventHandler, false);
    this.domElement.removeEventListener('mousemove', eventHandler, false);
    this.domElement.removeEventListener('mouseleave', eventHandler, false);
    this.domElement.removeEventListener('mouseup', eventHandler, false);
    window.removeEventListener('keydown', eventHandler, false);
    window.removeEventListener('keyup', eventHandler, false);
  };
};

TrackballModControls.prototype = Object.create(EventDispatcher.prototype);
TrackballModControls.prototype.constructor = TrackballModControls;

export default TrackballModControls;
