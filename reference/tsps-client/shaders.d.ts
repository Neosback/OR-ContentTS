declare module "*.glsl" {
    const value: string;
    export default value;
}

declare module "*.wgsl?source" {
    const value: string;
    export default value;
}

// Untyped JS modules (previously loaded with require()).
declare module "bzip2";
declare module "picogl/build/module/texture.js" {
    export const Texture: any;
}
