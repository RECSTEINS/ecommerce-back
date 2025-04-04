require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const multer = require('multer');
const path = require('path');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use('/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// --------------------- SUBIDA DE IMÁGENES ---------------------
app.post('/upload', upload.single('imagen'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No se subió ninguna imagen" });
    }
    res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

// --------------------- PRODUCTOS ---------------------
app.post('/productos', async (req, res) => {
    try {
        const { nombre, precio, imagen, descripcion, stock, imagenes, tamanos, caracteristicas, categorias } = req.body;
        
        const nuevoProducto = await prisma.producto.create({
            data: {
                nombre,
                precio,
                imagen,
                descripcion,
                stock,
                imagenes: { create: imagenes },
                tamanos: { create: tamanos },
                caracteristicas: { create: caracteristicas },
                categorias: {
                    create: categorias.map(catId => ({ categoria: { connect: { id: catId } } }))
                }
            }
        });
        res.json(nuevoProducto);
    } catch (error) {
        console.log(error);
    }
});

// ✅ GET: Obtener todos los productos
app.get('/productos', async (req, res) => {
    try {
        const productos = await prisma.producto.findMany({
            include: {
                imagenes: true,
                tamanos: true,
                caracteristicas: true,
                categorias: { include: { categoria: true } }
            }
        });
        res.json(productos);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener productos" });
    }
});

// --------------------- CATEGORÍAS ---------------------
app.post('/categorias', async (req, res) => {
    try {
        const { titulo, coleccion, thumb_src } = req.body;
        const nuevaCategoria = await prisma.categoria.create({
            data: { titulo, coleccion, thumb_src }
        });
        res.json(nuevaCategoria);
    } catch (error) {
        res.status(400).json({ error: "Error al crear categoría" });
    }
});

// ✅ GET: Obtener todas las categorías
app.get('/categorias', async (req, res) => {
    try {
        const categorias = await prisma.categoria.findMany();
        res.json(categorias);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener categorías" });
    }
});

// --------------------- PEDIDOS ---------------------
app.post('/pedidos', async (req, res) => {
    try {
        const { numeroOrden, productos } = req.body;
        const nuevoPedido = await prisma.pedido.create({
            data: {
                numeroOrden,
                productos: {
                    create: productos.map(p => ({
                        producto: { connect: { id: p.productoId } },
                        cantidad: p.cantidad
                    }))
                }
            }
        });
        res.json(nuevoPedido);
    } catch (error) {
        res.status(400).json({ error: "Error al crear pedido" });
    }
});

// ✅ GET: Obtener todos los pedidos con los productos asociados
app.get('/pedidos', async (req, res) => {
    try {
        const pedidos = await prisma.pedido.findMany({
            include: { productos: { include: { producto: true } } }
        });
        res.json(pedidos);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener pedidos" });
    }
});

// --------------------- RESEÑAS ---------------------
app.post('/productos/:id/resenas', async (req, res) => {
    try {
        const { nombre, rating, comentario, avatar } = req.body;
        const nuevaReseña = await prisma.resena.create({
            data: {
                nombre,
                rating,
                comentario,
                avatar,
                productoId: parseInt(req.params.id)
            }
        });
        res.json(nuevaReseña);
    } catch (error) {
        res.status(400).json({ error: "Error al agregar reseña" });
    }
});

// ✅ GET: Obtener todas las reseñas de un producto
app.get('/productos/:id/resenas', async (req, res) => {
    try {
        const resenas = await prisma.resena.findMany({
            where: { productoId: parseInt(req.params.id) }
        });
        res.json(resenas);
    } catch (error) {
        res.status(500).json({ error: "Error al obtener reseñas" });
    }
});


//! stripe

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

app.post('/crear-pago', async (req, res) => {
    const { items } = req.body;
    
    const line_items = items.map(item => ({
        price_data: {
            currency: 'mxn',
            product_data: { name: item.nombre },
            unit_amount: item.precio * 100
        },
        quantity: 1
    }));

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: 'http://localhost:3000/?pago=exitoso',       // ← tu página de inicio (frontend)
            cancel_url: 'http://localhost:3000/carrito',
            billing_address_collection: 'auto',
            customer_creation: 'always'
        });

        res.json({ id: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
  
    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
  
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
  
        // 🚀 Enviar el correo cuando el pago se completó exitosamente
        await enviarCorreo(
          session.customer_email,
          "¡Gracias por tu compra!",
          `<h1>Gracias por tu pedido en E-Shop</h1>
           <p>Tu pago fue procesado correctamente.</p>`
        );
      }
  
      res.status(200).send();
    } catch (err) {
      console.error("Webhook Error:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

//! Nodemailer
const nodemailer = require('nodemailer');

const enviarCorreo = async (to, asunto, cuerpoHtml) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: '202200440@upqroo.edu.mx',
      pass: 'lvepwidrcjpzxaiq' 
    }
  });

  await transporter.sendMail({
    from: '"E-Shop" <202200440@upqroo.edu.mx>',
    to,
    subject: asunto,
    html: cuerpoHtml
  });
};


// --------------------- INICIO SERVIDOR ---------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));