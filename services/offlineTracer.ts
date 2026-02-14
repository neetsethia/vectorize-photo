
/**
 * Ultra-Optimized GPU Raster-to-Vector Tracer
 * Upgraded to WebGL 2 / GLSL ES 3.00 for NVIDIA Performance
 * Orientation Fixed: No mirroring, no flipping.
 */

const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0, 1);
  v_texCoord = a_texCoord;
}`;

const PACKED_OPTIMIZED_SHADER = `#version 300 es
precision highp float;
in vec2 v_texCoord;
out vec4 fragColor;
uniform sampler2D u_image;
uniform vec2 u_resolution;
uniform float u_qFactor;

float luminance(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

vec3 quantize(vec3 color) {
  return floor(color * 255.0 / u_qFactor + 0.5) * u_qFactor / 255.0;
}

void main() {
  vec2 px = 1.0 / u_resolution;
  
  // Gaussian Kernel 5x5
  float w[25] = float[](
    0.003, 0.013, 0.022, 0.013, 0.003,
    0.013, 0.059, 0.097, 0.059, 0.013,
    0.022, 0.097, 0.159, 0.097, 0.022,
    0.013, 0.059, 0.097, 0.059, 0.013,
    0.003, 0.013, 0.022, 0.013, 0.003
  );

  vec3 blurred = vec3(0.0);
  
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      int idx = (j + 2) * 5 + (i + 2);
      blurred += texture(u_image, v_texCoord + vec2(float(i), float(j)) * px).rgb * w[idx];
    }
  }

  vec3 qColor = quantize(blurred);

  float sLeft = luminance(quantize(texture(u_image, v_texCoord + vec2(-px.x, 0.0)).rgb));
  float sRight = luminance(quantize(texture(u_image, v_texCoord + vec2(px.x, 0.0)).rgb));
  float sUp = luminance(quantize(texture(u_image, v_texCoord + vec2(0.0, -px.y)).rgb));
  float sDown = luminance(quantize(texture(u_image, v_texCoord + vec2(0.0, px.y)).rgb));

  float edge = abs(sLeft - sRight) + abs(sUp - sDown);
  
  fragColor = vec4(qColor, edge > 0.01 ? 1.0 : 0.0);
}`;

function createShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
  const program = gl.createProgram();
  if (!program) return null;
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  return program;
}

async function processOnGPU(img: HTMLImageElement, simplification: number): Promise<{ packedData: Uint8Array, width: number, height: number }> {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2', { 
    preserveDrawingBuffer: false, 
    alpha: true,
    powerPreference: "high-performance" 
  }) as WebGL2RenderingContext;
  
  if (!gl) throw new Error("WebGL 2 not supported.");

  const width = img.naturalWidth;
  const height = img.naturalHeight;
  canvas.width = width;
  canvas.height = height;

  const program = createProgram(gl, VERTEX_SHADER_SOURCE, PACKED_OPTIMIZED_SHADER);
  if (!program) throw new Error("Failed to compile shaders.");

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  // NDC: BL, BR, TL, TL, BR, TR
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1,  1, -1, -1,  1,
    -1,  1,  1, -1,  1,  1
  ]), gl.STATIC_DRAW);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  // TexCoords: BL, BR, TL, TL, BR, TR
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0,  1, 0,  0, 1,
    0, 1,  1, 0,  1, 1
  ]), gl.STATIC_DRAW);

  // Standard orientation: No automatic flip.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const srcTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, srcTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  gl.useProgram(program);
  gl.viewport(0, 0, width, height);
  
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);

  gl.uniform2f(gl.getUniformLocation(program, "u_resolution"), width, height);
  gl.uniform1f(gl.getUniformLocation(program, "u_qFactor"), Math.max(4, Math.floor(simplification / 3)));

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  const packedData = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, packedData);

  return { packedData, width, height };
}

export const traceImageOffline = async (
  file: File,
  simplification: number = 20
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        const { packedData, width, height } = await processOnGPU(img, simplification);

        // WebGL readPixels is bottom-to-top.
        // Index 0 is Bottom-Left.
        const quantizedColors = new Uint32Array(width * height);
        const uniqueColors = new Set<number>();
        
        for (let y = 0; y < height; y++) {
          const rowOffset = y * width;
          for (let x = 0; x < width; x++) {
            const srcIdx = (y * width + x) * 4;
            const packedColor = (packedData[srcIdx] << 16) | (packedData[srcIdx + 1] << 8) | packedData[srcIdx + 2];
            quantizedColors[rowOffset + x] = packedColor;
            if (packedColor !== 0) uniqueColors.add(packedColor);
          }
        }

        let svgPaths = '';
        const rowStep = Math.max(1, Math.floor(simplification / 20));

        uniqueColors.forEach(color => {
          const r = (color >> 16) & 0xFF;
          const g = (color >> 8) & 0xFF;
          const b = color & 0xFF;
          
          let pathData = '';
          // Draw from top (SVG Y=0) to bottom (SVG Y=height).
          // SVG Y=0 corresponds to data row 'height-1'.
          for (let svgY = 0; svgY < height; svgY += rowStep) {
            let startX = -1;
            const dataRowIndex = height - 1 - svgY;
            const dataRowOffset = dataRowIndex * width;
            
            for (let x = 0; x < width; x++) {
              if (quantizedColors[dataRowOffset + x] === color) {
                if (startX === -1) startX = x;
              } else if (startX !== -1) {
                pathData += `M${startX},${svgY}h${x - startX}v${rowStep}h${startX - x}z `;
                startX = -1;
              }
            }
            if (startX !== -1) {
              pathData += `M${startX},${svgY}h${width - startX}v${rowStep}h${startX - width}z `;
            }
          }
          
          if (pathData) {
            svgPaths += `<path d="${pathData}" fill="rgb(${r},${g},${b})" />`;
          }
        });

        const svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${svgPaths}</svg>`;
        URL.revokeObjectURL(url);
        resolve(svg);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => reject("Image load error");
    img.src = url;
  });
};
