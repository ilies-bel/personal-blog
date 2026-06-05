declare module 'three' {
  export class AdditiveBlending {}
  export class BackSide {}
  export class FloatType {}
  export class HalfFloatType {}
  export class NoToneMapping {}
  export class RGBAFormat {}
  export class SRGBColorSpace {}

  export class BufferAttribute { constructor(...args: any[]); [key: string]: any; }
  export class BufferGeometry { constructor(...args: any[]); [key: string]: any; }
  export class Color { constructor(...args: any[]); [key: string]: any; }
  export class DataTexture { constructor(...args: any[]); [key: string]: any; }
  export class Group { constructor(...args: any[]); [key: string]: any; }
  export class IcosahedronGeometry { constructor(...args: any[]); [key: string]: any; }
  export class LineSegments { constructor(...args: any[]); [key: string]: any; }
  export class Mesh { constructor(...args: any[]); [key: string]: any; }
  export class PerspectiveCamera { constructor(...args: any[]); [key: string]: any; }
  export class PlaneGeometry { constructor(...args: any[]); [key: string]: any; }
  export class Points { constructor(...args: any[]); [key: string]: any; }
  export class Scene { constructor(...args: any[]); [key: string]: any; }
  export class ShaderMaterial { constructor(...args: any[]); [key: string]: any; }
  export class Sphere { constructor(...args: any[]); [key: string]: any; }
  export class Texture { constructor(...args: any[]); [key: string]: any; }
  export class Vector2 { constructor(...args: any[]); [key: string]: any; }
  export class Vector3 { constructor(...args: any[]); [key: string]: any; }
  export class WebGLRenderer { constructor(...args: any[]); [key: string]: any; }
  export class WebGLRenderTarget { constructor(...args: any[]); [key: string]: any; }

  export const MathUtils: { degToRad(degrees: number): number };
  export const UniformsUtils: { clone<T>(uniforms: T): T };
}

declare module 'three/examples/jsm/postprocessing/EffectComposer.js' {
  export class EffectComposer { constructor(...args: any[]); [key: string]: any; }
}

declare module 'three/examples/jsm/postprocessing/RenderPass.js' {
  export class RenderPass { constructor(...args: any[]); [key: string]: any; }
}

declare module 'three/examples/jsm/postprocessing/ShaderPass.js' {
  export class ShaderPass { constructor(...args: any[]); [key: string]: any; }
}

declare module 'three/examples/jsm/postprocessing/UnrealBloomPass.js' {
  export class UnrealBloomPass { constructor(...args: any[]); [key: string]: any; }
}

declare module 'three/examples/jsm/misc/GPUComputationRenderer.js' {
  export class GPUComputationRenderer { constructor(...args: any[]); [key: string]: any; }
}
