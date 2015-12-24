/**
  * @author Lianna Eeftinck / https://github.com/Leeft
  */

import config from './config';
import settings from './settings';
import OrbitControls from './orbit-controls';
import { ui } from '../starcitizen-webgl-map';

import TextureManager from 'leeft/three-sprite-texture-atlas-manager';

import THREE from 'three';
import TWEEN from 'tween.js';
import Stats from 'stats.js';
import $ from 'jquery';

let oldRenderStats = {
  render: {
    calls: 0,
    faces: 0,
    points: 0,
    vertices: 0,
  },
  memory: {
    geometries: 0,
    textures: 0,
  }
};

class Renderer {
  constructor ( map ) {
    this.map = map;

    this.composer = null;
    this.FXAA = null;
    this.camera = null;

    if ( config.debug ) {
      console.info( 'Additional debugging enabled' );
    }

    if ( config.quality === 'low' ) {
      console.info( 'Low quality mode enabled' );
    }

    this.textureManager = new TextureManager( ( config.quality === 'low' ) ? 1024 : 2048 );
    //this.textureManager.debug = ( config.debug ) ? true : false;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    this.dpr = 1;
    if ( window.devicePixelRatio !== undefined ) {
      this.dpr = window.devicePixelRatio;
    }

    let container = $('#sc-map-webgl-container')[0];

    this.camera = new THREE.PerspectiveCamera( 45, this.width / this.height, 10, 1600 );
    this.camera.position.copy( settings.camera.camera );
    this.camera.setViewOffset( this.width, this.height, -( $('#sc-map-interface .sc-map-ui-padding').width() / 2 ), 0, this.width, this.height );

    this.controls = new OrbitControls( this, container );
    this.controls.target.copy( settings.camera.target );
    this.controls.rotateSpeed = config.rotateSpeed;
    this.controls.zoomSpeed = config.zoomSpeed;
    this.controls.panSpeed = config.panSpeed;
    this.controls.noRotate = settings.control.rotationLocked;

    this.threeRenderer = new THREE.WebGLRenderer( { antialias: ( config.quality !== 'low' ) } );
    this.threeRenderer.shadowMap.enabled = false;

    if ( config.debug ) {
      console.info( `The renderer is`, this.threeRenderer );
    }

    if ( ! settings.effect.Antialias ) {
      this.threeRenderer.autoClear = false;
    }

    this.threeRenderer.setClearColor( 0x000000, 1 );
    this.threeRenderer.setSize( this.width, this.height );

    container.appendChild( this.threeRenderer.domElement );

    let renderer = this;

    // Stats

    this.stats = new Stats();
    this.stats.domElement.style.position = 'absolute';
    this.stats.domElement.style.top = '0px';
    this.stats.domElement.style.right = '0px';
    this.stats.domElement.style.display = 'none';
    this.stats.domElement.style.zIndex = '100';
    container.appendChild( this.stats.domElement );
    if ( settings.renderer.Stats ) {
      $('#stats').show();
    }

    // Event handlers

    window.addEventListener( 'resize', this.resize, false );
    document.addEventListener( 'change', this.render, false );

    // FIXME: Bring in these classes again, re-enable the feature?
    //if ( ! settings.effect.Antialias )
    //{
    //  let renderModel = new THREE.RenderPass( map.scene, this.camera );

    //  this.FXAA = new THREE.ShaderPass( THREE.FXAAShader );
    //  this.FXAA.uniforms.resolution.value.set( 1 / (this.width * this.dpr), 1 / (this.height * this.dpr) );
    //  this.FXAA.enabled = settings.effect.FXAA;

    //  let effectBloom = new THREE.BloomPass( 0.6 );
    //  effectBloom.enabled = settings.effect.Bloom;

    //  let effectCopy = new THREE.ShaderPass( THREE.CopyShader );
    //  effectCopy.renderToScreen = true;

    //  this.composer = new THREE.EffectComposer( this.threeRenderer );
    //  this.composer.setSize( this.width * this.dpr, this.height * this.dpr );
    //  this.composer.addPass( renderModel );
    //  this.composer.addPass( this.FXAA );
    //  this.composer.addPass( effectBloom );
    //  this.composer.addPass( effectCopy );
    //}
  }

  cameraRotationMatrix () {
    let euler = new THREE.Euler( this.camera.userData.phi + Math.PI / 2, this.camera.userData.theta, 0, 'YXZ' );
    return new THREE.Matrix4().makeRotationFromEuler( euler );
  }

  debugRenderer () {
    const $elem = $('#debug-renderer');
    const renderStats = this.threeRenderer.info;

    [ 'calls', 'faces', 'points', 'vertices' ].forEach( property => {
      if ( renderStats.render[ property ] !== oldRenderStats.render[ property ] ) {
        $elem.find(`dd.${ property }`).text( renderStats.render[ property ] );
        oldRenderStats.render[ property ] = renderStats.render[ property ];
      }
    });

    [ 'geometries', 'textures' ].forEach( property => {
      if ( renderStats.memory[ property ] !== oldRenderStats.memory[ property ] ) {
        $elem.find(`dd.${ property }`).text( renderStats.memory[ property ] );
        oldRenderStats.memory[ property ] = renderStats.memory[ property ];
      }
    });
  }

  resize () {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.setViewOffset( this.width, this.height, -( $('#sc-map-interface .sc-map-ui-padding').width() / 2 ), 0, this.width, this.height );
    this.camera.updateProjectionMatrix();

    if ( this.FXAA ) {
      this.FXAA.uniforms.resolution.value.set( 1 / (this.width * this.dpr), 1 / (this.height * this.dpr) );
    }

    this.threeRenderer.setSize( this.width, this.height );
    if ( this.composer ) {
      this.composer.reset();
    }

    ui.updateHeight();
  }

  render () {
    if ( ! this.controls ) {
      return;
    }

    this.controls.update();
    this.map.animate();

    TWEEN.update();

    if ( config.debug ) {
      this.debugRenderer();
    }

    this.stats.update();

    if ( this.composer ) {
      this.threeRenderer.clear();
      this.composer.render();
    } else {
      this.threeRenderer.render( this.map.scene, this.camera );
    }
  }
}

export default Renderer;
