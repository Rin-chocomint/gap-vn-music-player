class WebGPUVisualizer {
    constructor(containerId, numBars) {
        this.container = document.getElementById(containerId);
        this.numBars = numBars;
        this.canvas = null;
        this.device = null;
        this.context = null;
        this.pipeline = null;
        this.uniformBuffer = null;
        this.dataBuffer = null;
        this.bindGroup = null;
        this.initialized = false;
        this.isEnabled = false;
        this.observer = null;
    }

    async init() {
        if (!navigator.gpu) {
            console.error("WebGPU tidak didukung.");
            return false;
        }

        this.adapter = await navigator.gpu.requestAdapter();
        if (!this.adapter) {
            console.error("Tidak ditemukan adapter WebGPU.");
            return false;
        }

        this.device = await this.adapter.requestDevice();

        // Buat Canvas
        this.canvas = document.createElement('canvas');
        this.canvas.style.width = '100%';
        this.canvas.style.height = '100%';
        this.canvas.style.display = 'block';

        // Masukkan canvas ke container (bersihkan dulu jika perlu, tapi kita handle di toggle)
        // Untuk saat ini, kita buat saja dulu.

        // Buat Context WebGPU
        // 'alphaMode: premultiplied' penting biar background canvas bisa transparan
        // dan nyatu sama elemen HTML di belakangnya tanpa artefak pinggiran hitam.
        this.context = this.canvas.getContext('webgpu');
        const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        this.context.configure({
            device: this.device,
            format: presentationFormat,
            alphaMode: 'premultiplied',
        });

        // Shader
        const shaderModule = this.device.createShaderModule({
            code: `
                struct Uniforms {
                    color: vec4f,
                    style: f32, // 0.0 = Klasik, 1.0 = Modern
                    padding: f32,
                    resolution: vec2f,
                };

                @group(0) @binding(0) var<uniform> uniforms: Uniforms;
                @group(0) @binding(1) var<storage, read> data: array<f32>;

                struct VertexOutput {
                    @builtin(position) position: vec4f,
                    @location(0) color: vec4f,
                    @location(1) vUV: vec2f,
                    @location(2) vSize: vec2f,
                };

                @vertex
                fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
                    let numBars = f32(arrayLength(&data));
                    let barIndex = f32(instanceIndex);
                    let value = data[instanceIndex]; // 0.0 to 1.0

                    // Geometri Bar (quad)
                    var pos = vec2f(0.0, 0.0);
                    if (vertexIndex == 0u) { pos = vec2f(0.0, 1.0); } // Top-Left
                    else if (vertexIndex == 1u) { pos = vec2f(1.0, 1.0); } // Top-Right
                    else if (vertexIndex == 2u) { pos = vec2f(0.0, 0.0); } // Bottom-Left
                    else if (vertexIndex == 3u) { pos = vec2f(1.0, 1.0); } // Top-Right
                    else if (vertexIndex == 4u) { pos = vec2f(0.0, 0.0); } // Bottom-Left
                    else if (vertexIndex == 5u) { pos = vec2f(1.0, 0.0); } // Bottom-Right

                    // === LOGIKA GEOMETRI BAR (QUAD) ===
                    // Kita ngerender banyak kotak (quad) yang tiap kotak mewakili 1 bar frekuensi.
                    // instanceIndex = ID bar ke-berapa.
                    
                    let gap = 0.3; // Jarak antar bar (30% dari lebar slot)
                    let totalWidth = 2.0; // Lebar layar dalam Clip Space OpenGL/WebGPU (-1 s/d 1 = 2.0 unit)
                    let barWidth = totalWidth / numBars; // Lebar jatah per bar
                    let actualBarWidth = barWidth * (1.0 - gap); // Lebar visual bar setelah dikurangi gap
                    
                    // Hitung posisi X awal (kiri) untuk bar ini
                    let x = -1.0 + (barIndex * barWidth) + (barWidth * gap * 0.5);
                    
                    var finalY = 0.0;
                    var finalX = x + (pos.x * actualBarWidth);
                    var outputColor = vec4f(0.0);
                    var height = 0.0;

                    if (uniforms.style < 0.5) {
                        // Gaya Klasik: Origin tengah, warna solid
                        // Skala ditingkatkan agar cocok dengan visualizer DOM (sekitar 2.6x tinggi clip)
                        // Tambah tinggi dasar (0.02) biar gak pernah benar-benar hilang
                        height = 0.02 + value * 2.6; 
                        let halfHeight = height * 0.5;
                        
                        // pos.y jalan dari 0 ke 1. Kita mau dari -halfHeight ke +halfHeight
                        let yOffset = (pos.y * height) - halfHeight;
                        finalY = yOffset;
                        
                        outputColor = vec4f(0.85, 0.85, 0.85, 1.0); // #dadada
                    } else {
                        // Gaya Modern: Origin bawah, gradasi
                        height = value * 2.0;
                        let y = -1.0;
                        finalY = y + (pos.y * height);
                        
                        let colorLow = vec4f(0.0, 1.0, 1.0, 1.0); // Cyan
                        let colorHigh = vec4f(0.5, 0.0, 1.0, 1.0); // Ungu
                        outputColor = mix(colorLow, colorHigh, value);
                    }

                    var output: VertexOutput;
                    output.position = vec4f(finalX, finalY, 0.0, 1.0);
                    output.color = outputColor * uniforms.color;
                    output.vUV = pos;
                    output.vSize = vec2f(actualBarWidth, height);
                    
                    return output;
                }

                @fragment
                fn fs_main(input: VertexOutput) -> @location(0) vec4f {
                    // === LOGIKA SDF (SIGNED DISTANCE FIELD) UNTUK ROUNDED CORNER ===
                    // Daripada pake geometri kompleks (banyak segitiga) buat bikin sudut tumpul,
                    // mending kita hitung secara matematis per-pixel di Fragment Shader.
                    
                    // 1. Tentukan ukuran kotak dalam pixel.
                    // input.vSize adalah ukuran relatif CLIP space. Kita kali resolusi layar / 2.
                    let sizePixels = input.vSize * 0.5 * uniforms.resolution;
                    
                    // 2. Pusat koordinat UV kita ubah ke tengah (0,0) biar simetris.
                    // Asalnya 0..1 jadi -0.5..0.5
                    let uvCentered = input.vUV - 0.5;
                    
                    // 3. Konversi posisi sekarang ke pixel absolut.
                    let posPixels = uvCentered * sizePixels;
                    
                    // 4. Tentukan radius sudut. 
                    // Kita ambil setengah dari sisi terpendek agar bentuknya 'kapsul' atau 'pil'.
                    let radius = min(sizePixels.x, sizePixels.y) * 0.5;
                    
                    // 5. Rumus Jarak SDF Kotak (Rounded Box 2D)
                    // Rumus: d = length(max(abs(p) - (size/2 - r), 0.0)) - r
                    // Intinya: "Seberapa jauh pixel ini dari bentuk kotak ideal?"
                    
                    let halfSize = sizePixels * 0.5;
                    let b = halfSize - vec2f(radius); // Ukuran kotak daleman (inner box) sebelum lengkungan
                    
                    let q = abs(posPixels) - b;
                    // Jarak ke permukaan kotak bulat
                    let d = length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - radius;
                    
                    // Jika d > 0.0, berarti pixel di luar bentuk -> buang (transparan)
                    if (d > 0.0) {
                        discard;
                    }

                    return input.color;
                }
            `
        });

        // Pipeline
        this.pipeline = this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: shaderModule,
                entryPoint: 'vs_main',
            },
            fragment: {
                module: shaderModule,
                entryPoint: 'fs_main',
                targets: [{ format: presentationFormat }],
            },
            primitive: {
                topology: 'triangle-list',
            },
        });

        // Buffers
        this.uniformBuffer = this.device.createBuffer({
            size: 32, // vec4f (16) + f32 (4) + padding (12) -> alignment 32 byte
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Data uniform awal (Warna putih, Style 1.0 = Modern)
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([
            1.0, 1.0, 1.0, 1.0, // Warna
            1.0, 0.0, this.canvas.width, this.canvas.height  // Style (1.0), Padding, ResX, ResY
        ]));

        // Buffer data (storage)
        // Ukuran: numBars * 4 byte (f32)
        this.dataBuffer = this.device.createBuffer({
            size: this.numBars * 4,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });

        // Bind Group
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } },
                { binding: 1, resource: { buffer: this.dataBuffer } },
            ],
        });

        this.initialized = true;
        return true;
    }

    enable() {
        if (!this.initialized) return;
        this.isEnabled = true;
        this.container.innerHTML = ''; // Bersihkan bar DOM
        this.container.appendChild(this.canvas);

        // Paksa resize awal
        const rect = this.container.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            this.canvas.width = rect.width;
            this.canvas.height = rect.height;
        }

        // Resize canvas biar pas sama container
        if (this.observer) this.observer.disconnect();
        this.observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                const width = entry.contentRect.width;
                const height = entry.contentRect.height;
                if (width > 0 && height > 0) {
                    this.canvas.width = width;
                    this.canvas.height = height;
                }
            }
        });
        this.observer.observe(this.container);
    }

    disable() {
        this.isEnabled = false;
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }

    setStyle(styleIndex) {
        if (!this.initialized) return;
        // styleIndex: 0 = Klasik, 1 = Modern
        this.device.queue.writeBuffer(this.uniformBuffer, 16, new Float32Array([styleIndex]));
    }

    render(dataArray) {
        if (!this.isEnabled || !this.initialized) return;

        // Update resolusi
        this.device.queue.writeBuffer(this.uniformBuffer, 24, new Float32Array([this.canvas.width, this.canvas.height]));

        // Konversi Data Audio (Uint8 -> Float32)
        // Shader butuh float (0.0 - 1.0), tapi data audio biasanya byte (0 - 255).
        // Kita konversi di CPU sebelum kirim ke GPU buffer.
        // Bisa juga dilakukan di Compute Shader kalau mau performa super tinggi, 
        // tapi untuk visualizer sederhana, ini sudah cukup cepat.

        const floatData = new Float32Array(this.numBars);
        for (let i = 0; i < this.numBars; i++) {
            let val = (dataArray[i] || 0) / 255.0; // Normalisasi
            floatData[i] = val;
        }

        this.device.queue.writeBuffer(this.dataBuffer, 0, floatData);

        const commandEncoder = this.device.createCommandEncoder();
        const textureView = this.context.getCurrentTexture().createView();

        const renderPassDescriptor = {
            colorAttachments: [{
                view: textureView,
                clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 }, // Transparan
                loadOp: 'clear',
                storeOp: 'store',
            }],
        };

        const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
        passEncoder.setPipeline(this.pipeline);
        passEncoder.setBindGroup(0, this.bindGroup);
        passEncoder.draw(6, this.numBars, 0, 0); // 6 vertices per quad, numBars instances
        passEncoder.end();

        this.device.queue.submit([commandEncoder.finish()]);
    }
}
