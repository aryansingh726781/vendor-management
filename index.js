const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Joi = require("joi");
const cors = require("cors");
const { expressjwt: jwtMiddleware } = require("express-jwt");
require("dotenv").config();


const app = express();
app.use(express.json());

app.use(cors({
    origin: "http://localhost:3000",
    methods: "GET,POST,PUT,DELETE",
    credentials: true,
  }));


// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, 
}).then(() => console.log("MongoDB connected"))
  .catch(err => console.error(err));

// Schemas
const vendorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true },
  stock: { type: Number, required: true },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor", required: true },
  createdAt: { type: Date, default: Date.now },
});

const orderSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  quantity: { type: Number, required: true },
  status: { type: String, enum: ["pending", "shipped"], default: "pending" },
  createdAt: { type: Date, default: Date.now },
});

// Models
const Vendor = mongoose.model("Vendor", vendorSchema);
const Product = mongoose.model("Product", productSchema);
const Order = mongoose.model("Order", orderSchema);

// Middleware
const authMiddleware = jwtMiddleware({
  secret: process.env.JWT_SECRET,
  algorithms: ["HS256"],
});

// Validators
const vendorValidator = Joi.object({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required(),
});

const productValidator = Joi.object({
  name: Joi.string().required(),
  price: Joi.number().required(),
  stock: Joi.number().required(),
});

// Routes
// 1.  Registration

// app.post("/api/vendors/register", async (req, res) => {
//     // Log incoming request body for debugging
//     console.log("Request body:", req.body);
  
//     // Validate incoming data using Joi schema
//     const { error } = vendorValidator.validate(req.body);
//     if (error) {
//       // Send a 400 Bad Request response with the validation error message
//       return res.status(400).json({ message: error.details[0].message });
//     }
  
//     const { name, email, password } = req.body;
  
//     try {
//       // Check if the vendor already exists


//       const existingVendor = await Vendor.findOne({ email });
//       if (existingVendor) {
//         // If vendor exists, return a 400 error
//         return res.status(400).json({ message: "Email already exists" });
//       }
  
//       // Hash the password before saving it to the database
//       const hashedPassword = await bcrypt.hash(password, 10);
  
//       // Create a new vendor document
//       const vendor = new Vendor({
//         name,
//         email,
//         password: hashedPassword,
//       });
  
//       // Save the vendor to the database
//       await vendor.save();
  
//       // Respond with a success message
//       res.status(201).json({ message: "Vendor registered successfully" });
//     } catch (err) {
//       // Handle server errors
//       console.error("Server error:", err);
//       res.status(500).json({ message: "Server error, please try again later" });
//     }
//   });





app.post("/api/vendors/register", async (req, res) => {
  try {
    // Log the incoming request body for debugging
    console.log("Incoming Request:", req.body);

    // Validate request payload using Joi or other schema validation
    const { error } = vendorValidator.validate(req.body);
    if (error) {
      console.log("Validation Error:", error.details[0].message); // Log validation error
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, email, password } = req.body;

    // Check if a vendor with the same email already exists
    const existingVendor = await Vendor.findOne({ email });
    if (existingVendor) {
      console.log("Vendor already exists with email:", email); // Log duplicate email
      return res.status(400).json({ message: "Email already exists" });
    }

    // Hash the password for security
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new Vendor document
    const vendor = new Vendor({
      name,
      email,
      password: hashedPassword,
    });

    // Save the vendor to the database
    await vendor.save();

    // Log successful registration
    console.log("Vendor registered successfully:", vendor);

    // Respond with success message
    return res.status(201).json({ message: "Vendor registered successfully" });
  } catch (err) {
    // Log the error for debugging
    console.error("Error during vendor registration:", err);

    // Respond with server error message
    return res.status(500).json({ message: "Server error, please try again later" });
  }
});
  

// 2. Vendor Login
app.post("/api/vendors/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const vendor = await Vendor.findOne({ email });
    if (!vendor) return res.status(400).send("Invalid email or password");

    const isMatch = await bcrypt.compare(password, vendor.password);
    if (!isMatch) return res.status(400).send("Invalid email or password");

    const token = jwt.sign({ id: vendor._id }, process.env.JWT_SECRET, { expiresIn: "1d" });
    res.status(200).send({ token });
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// 3. Add a Product
app.post("/api/products", authMiddleware, async (req, res) => {
  try {
    const { error } = productValidator.validate(req.body);
    if (error) return res.status(400).send(error.details[0].message);

    const { name, price, stock } = req.body;
    const product = new Product({ name, price, stock, vendor: req.auth.id });
    await product.save();
    res.status(201).send("Product added successfully");
  } catch (err) {
    res.status(500).send("Server error");
  }
});



// 4. List Products (with Pagination)
app.get("/api/products", authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const products = await Product.find({ vendor: req.auth.id })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.status(200).send(products);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

app.get("/api/products/:id", authMiddleware, async (req, res) => {
    console.log("Received ID:", req.params.id);  // Log the ID to check
    try {
      const product = await Product.findOne({ _id: req.params.id, vendor: req.auth.id });
      if (!product) return res.status(404).send("Product not found");
      res.status(200).send(product);
    } catch (err) {
      res.status(500).send("Server error");
    }
  });
  

// 5. Update Product
app.put("/api/products/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOneAndUpdate(
      { _id: id, vendor: req.auth.id },
      req.body,
      { new: true }
    );
    if (!product) return res.status(404).send("Product not found");
    res.status(200).send("Product updated successfully");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// 6. Delete Product
app.delete("/api/products/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findOneAndDelete({ _id: id, vendor: req.auth.id });
    if (!product) return res.status(404).send("Product not found");
    res.status(200).send("Product deleted successfully");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// 7. List Orders
app.get("/api/orders", authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ vendor: req.auth.id }).populate("product");
    res.status(200).send(orders);
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// 8. Mark Order as Shipped
app.put("/api/orders/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findOneAndUpdate(
      { _id: id, vendor: req.auth.id },
      { status: "shipped" },
      { new: true }
    );
    if (!order) return res.status(404).send("Order not found");
    res.status(200).send("Order marked as shipped");
  } catch (err) {
    res.status(500).send("Server error");
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
