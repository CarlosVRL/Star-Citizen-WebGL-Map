/**
 * @author Lianna Eeftinck / https://github.com/Leeft
 */
import settings from './settings';
import { LABEL_SCALE, UNKNOWN_SYSTEM_SCALE } from './system';

class SystemLabel {
  constructor ( system ) {
    this.system = system;

    this.node = null;
    this.fontFamily = `'Segoe UI', 'Lucida Grande', 'Tahoma', 'Calibri', 'Roboto', sans-serif`;

    this.textsize = 58; // px
    this.textVerticalOffset = 8.5; // number of scale 1.0 unit the text is shifted by
    this.symbolVerticalOffset = -22.5; // number of scale 1.0 units the symbols are shifted by
    this.paddingX = 6; // number of scale 1.0 units to add to the width
    this.paddingY = 36.5; // number of scale 1.0 units to add to the height

    this.symbolSize = 24;
    this.symbolSpacing = 2;
    this.outline = 2.4;

    this._width = null; // computed and cached width
    this._height = null; // computed and cached height

    // Governing label scale, can be used to shrink or enlarge the rendering
    this.scale = 1.2;
    if ( this.system.isUnknown() ) {
      this.scale = 0.8;
    }

    this.scale *= 0.74 * 2;
  }

  clear () {
    if ( ! this.node ) {
      return;
    }
    this.node.clear();
  }

  uvCoordinates () {
    if ( ! this.node ) {
      return null;
    }
    return this.node.uvCoordinates();
  }

  getNode ( knapsack ) {
    if ( this.node ) {
      return this.node;
    }
    let context = knapsack.canvas.getContext('2d');
    this.node = knapsack.insert({ width: Math.floor( this.width( context ) ) - 1, height: Math.floor( this.height( context ) ) - 1 });
    return this.node;
  }

  drawText () {
    if ( ! this.node ) {
      return false;
    }
    let ctx = this.node.clipContext();
    ctx.scale( this.scale, this.scale );
    ctx.font = 'Bold ' + ( this.textsize ) + 'px ' + this.fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.system.factionStyle();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = this.outline;
    ctx.miterLimit = 2;
    ctx.fillText( this.system.name, 0, this.textVerticalOffset );
    ctx.strokeStyle = 'rgb(0,0,0)';
    ctx.strokeText( this.system.name, 0, this.textVerticalOffset );
    this.node.restoreContext();
    return true;
  }

  // Draws the icon(s) on a canvas context
  drawSymbols () {
    let symbols = this.system.getSymbols();
    let x = - ( this.symbolsWidth( symbols ) / 2 );
    let i, symbol;
    let offX, offY;

    if ( ! this.node ) {
      return false;
    }

    let ctx = this.node.clipContext();
    ctx.scale( this.scale, this.scale );

    for ( i = 0; i < symbols.length; i++ )
    {
      symbol = symbols[ i ];

      //ctx.beginPath();
      //ctx.rect( x, y - this.symbolSize - 1, this.symbolSize + 2, this.symbolSize + 2 );
      //ctx.lineWidth = 3;
      //ctx.strokeStyle = 'green';
      //ctx.stroke();

      offX = 0;
      offY = 0;
      if ( symbol.offset ) {
        offX = symbol.offset.x;
        offY = symbol.offset.y;
      }

      ctx.font = ( this.symbolSize * symbol.scale ).toFixed(2) + 'px FontAwesome';
      ctx.strokeStyle = 'rgba(0,0,0,1.0)';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeText( symbol.code, x + offX + ( this.symbolSize / 2 ), this.symbolVerticalOffset + offY );

      ctx.fillStyle = symbol.color;
      ctx.fillText( symbol.code, x + offX + ( this.symbolSize / 2 ), this.symbolVerticalOffset + offY );

      x += this.symbolSize + this.symbolSpacing;
    }

    this.node.restoreContext();
  }

  update ( drawSymbols ) {
    // TODO: optimisation; redraw in same node when the size is still the same

    let curKnapsack = this.node.knapsack;

    if ( this.node ) {
      this.node.release();
      this.node = null;
    }

    this._width = null;
    this._height = null;
    this.node = window.renderer.textureManager.allocate( this.width(), this.height() );
    if ( ! this.node ) {
      return null;
    }

    this.drawText();
    if ( drawSymbols ) {
      this.drawSymbols();
    }

    // Detect whether the texture map has been changed, then update the material
    if ( this.node.knapsack !== curKnapsack ) {
      this.sceneObject.material = new THREE.SpriteMaterial({ map: this.node.texture });
    }

    this.sceneObject.material.texture = this.node.texture;
    this.sceneObject.material.map.needsUpdate = true;
    this.scaleSprite();

    return true;
  }

  scaleSprite () {
    let scale = settings.labelScale * LABEL_SCALE;
    this.sceneObject.scale.set(
        scale * ( this.node.width / this.node.height ), scale, 1
        );
    if ( this.system.isUnknown() ) {
      this.sceneObject.scale.x *= UNKNOWN_SYSTEM_SCALE;
      this.sceneObject.scale.y *= UNKNOWN_SYSTEM_SCALE;
    }
  }

  positionSprite ( matrix ) {
    this.sceneObject.userData.position = new THREE.Vector3( 0, - settings.labelOffset, - 0.1 );
    let spriteOffset = this.sceneObject.userData.position.clone();
    spriteOffset.applyMatrix4( matrix );
    this.sceneObject.position.copy( spriteOffset );
  }

  symbolsWidth ( symbols ) {
    return ( ( this.symbolSize * symbols.length ) + ( this.symbolSpacing * ( symbols.length - 1 ) ) );
  }

  width ( context ) {
    let tmpWidth;
    let symbolsWidth;
    let canvas;

    if ( this._width ) {
      return this._width;
    }

    if ( !context ) {
      canvas = document.createElement( 'canvas' );
      canvas.width = 256;
      canvas.height = 100;
      context = canvas.getContext('2d');
    }

    context.font = 'Bold ' + this.textsize + 'px ' + this.fontFamily;
    context.textBaseline = 'bottom';
    context.lineWidth = this.outline;
    tmpWidth = context.measureText( this.system.name ).width + this.paddingX;
    symbolsWidth = this.symbolsWidth( this.system.getSymbols() );
    if ( tmpWidth < symbolsWidth ) {
      tmpWidth = symbolsWidth + ( 4 * this.paddingX );
    }
    this._width = Math.floor( tmpWidth * this.scale );
    return this._width;
  }

  height () {
    if ( this._height ) {
      return this._height;
    }
    this._height = Math.floor( ( this.textsize + this.paddingY ) * this.scale );
    return this._height;
  }
}

export default SystemLabel;
