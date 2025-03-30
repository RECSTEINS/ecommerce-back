require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/productos', async (req, res) => {
    const productos = await prisma.producto.findMany();
    res.json(productos);
});

app.post('/productos', async( req, res) => {
    const { nombre, precio, imagen, descripcion, stock } = req.body;
    const nuevoProducto = await prisma.producto.create({
        data: { nombre, precio, imagen, descripcion, stock}
    });
    res.json(nuevoProducto);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor corriendo en el puerto ${PORT}`));