const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const app = express();


// ========================================
// BASIC MIDDLEWARE
// ========================================

app.use(cors());
app.use(express.json());


// ========================================
// UPLOAD FOLDER
// ========================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


// ========================================
// MULTER IMAGE UPLOAD
// ========================================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname);

    const uniqueName =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;

    cb(null, uniqueName);
  },
});

const imageFilter = (req, file, cb) => {
  const allowedTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Only JPG, JPEG, PNG and WEBP images are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});


// ========================================
// SERVE UPLOADED IMAGES
// ========================================

app.use("/uploads", express.static(uploadDir));


// ========================================
// MONGODB CONNECTION
// ========================================

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected ✅");
  })
  .catch((error) => {
    console.log(
      "MongoDB Error ❌",
      error.message
    );
  });


// ========================================
// ORDER SCHEMA
// ========================================

const orderSchema = new mongoose.Schema(
  {
    customer: {
      name: {
        type: String,
        required: true,
        trim: true,
      },

      mobile: {
        type: String,
        required: true,
        trim: true,
      },

      address: {
        type: String,
        required: true,
        trim: true,
      },

      city: {
        type: String,
        required: true,
        trim: true,
      },

      pincode: {
        type: String,
        required: true,
        trim: true,
      },

      notes: {
        type: String,
        default: "",
        trim: true,
      },
    },

    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: false,
        },

        // Old orders may still have numeric IDs.
        id: {
          type: mongoose.Schema.Types.Mixed,
          required: false,
        },

        name: {
          type: String,
          required: true,
        },

        image: {
          type: String,
          default: "",
        },

        size: {
          type: String,
          default: "",
        },

        price: {
          type: Number,
          required: true,
        },

        quantity: {
          type: Number,
          required: true,
          min: 1,
        },

        total: {
          type: Number,
          required: true,
        },
      },
    ],

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    delivery: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    paymentMethod: {
      type: String,
      enum: ["COD"],
      default: "COD",
    },

    status: {
      type: String,
      enum: [
        "Pending",
        "Confirmed",
        "Shipped",
        "Delivered",
        "Cancelled",
      ],
      default: "Pending",
    },
  },
  {
    timestamps: true,
  }
);

const Order =
  mongoose.models.Order ||
  mongoose.model("Order", orderSchema);


// ========================================
// PRODUCT SCHEMA
// ========================================

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    oldPrice: {
      type: Number,
      default: 0,
      min: 0,
    },

    badge: {
      type: String,
      default: "NEW",
      trim: true,
    },

    image: {
      type: String,
      required: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    sizes: {
      type: [String],
      default: [],
    },

    // Total stock.
    // For new products this is automatically calculated
    // from sizeStock.
    stock: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Example:
    // {
    //   S: 5,
    //   M: 10,
    //   L: 8,
    //   XL: 3
    // }
    sizeStock: {
      type: Map,
      of: {
        type: Number,
        min: 0,
      },
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

const Product =
  mongoose.models.Product ||
  mongoose.model("Product", productSchema);


// ========================================
// HELPERS
// ========================================

const cleanSizeStock = (sizeStock) => {
  if (!sizeStock || typeof sizeStock !== "object") {
    return {};
  }

  const cleaned = {};

  Object.entries(sizeStock).forEach(
    ([size, value]) => {
      const quantity = Number(value);

      if (
        size &&
        Number.isFinite(quantity) &&
        quantity >= 0
      ) {
        cleaned[size.trim()] =
          Math.floor(quantity);
      }
    }
  );

  return cleaned;
};


const calculateTotalStock = (
  sizeStock
) => {
  return Object.values(
    sizeStock || {}
  ).reduce(
    (total, quantity) =>
      total + Number(quantity || 0),
    0
  );
};


const getSizeStockObject = (
  product
) => {
  if (
    !product ||
    !product.sizeStock
  ) {
    return {};
  }

  if (
    product.sizeStock instanceof Map
  ) {
    return Object.fromEntries(
      product.sizeStock
    );
  }

  if (
    typeof product.sizeStock.toJSON ===
    "function"
  ) {
    return product.sizeStock.toJSON();
  }

  if (
    typeof product.sizeStock.toObject ===
    "function"
  ) {
    const obj =
      product.sizeStock.toObject();

    return obj instanceof Map
      ? Object.fromEntries(obj)
      : (obj || {});
  }

  return {
    ...product.sizeStock,
  };
};


// ========================================
// HOME
// ========================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message:
      "Metro Mens Wear Backend Running 🚀",
  });
});


// ========================================
// ADMIN LOGIN
// ========================================

app.post(
  "/api/admin/login",
  (req, res) => {
    try {
      const {
        username,
        password,
      } = req.body;

      if (
        username !==
          process.env.ADMIN_USERNAME ||
        password !==
          process.env.ADMIN_PASSWORD
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid username or password",
        });
      }

      const token = jwt.sign(
        {
          username,
          role: "admin",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "2h",
        }
      );

      res.json({
        success: true,
        message:
          "Login successful",
        token,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Login failed",
      });
    }
  }
);


// ========================================
// ADMIN AUTH MIDDLEWARE
// ========================================

const adminAuth = (
  req,
  res,
  next
) => {
  try {
    const authHeader =
      req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith(
        "Bearer "
      )
    ) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    const token =
      authHeader.split(" ")[1];

    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    if (
      decoded.role !==
      "admin"
    ) {
      return res.status(403).json({
        success: false,
        message:
          "Admin access required",
      });
    }

    req.admin = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message:
        "Invalid or expired token",
    });
  }
};


// ========================================
// IMAGE UPLOAD
// ADMIN ONLY
// ========================================

app.post(
  "/api/upload-image",
  adminAuth,
  upload.single("image"),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "Please select an image",
        });
      }

      const imageUrl =
        `/uploads/${req.file.filename}`;

      res.status(201).json({
        success: true,
        message:
          "Image uploaded successfully",
        image: imageUrl,
      });
    } catch (error) {
      console.log(
        "Image upload error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Image upload failed",
      });
    }
  }
);



app.post("/api/orders", async (req, res) => {
  const changedStock = [];

  try {
    const { customer, items } = req.body;

    if (
      !customer ||
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 50
    ) {
      return res.status(400).json({
        success: false,
        message: "Customer details and valid items are required",
      });
    }

    const requiredFields = [
      "name",
      "mobile",
      "address",
      "city",
      "pincode",
    ];

    for (const field of requiredFields) {
      if (
        typeof customer[field] !== "string" ||
        !customer[field].trim()
      ) {
        return res.status(400).json({
          success: false,
          message: `Valid customer ${field} is required`,
        });
      }
    }

    // Validate and group product + size combinations.
    const requestedStock = new Map();

    for (const item of items) {
      if (
        !item.productId ||
        !mongoose.Types.ObjectId.isValid(item.productId)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid product ID",
        });
      }

      const quantity = Number(item.quantity);
      const size = String(item.size || "").trim();

      if (!Number.isSafeInteger(quantity) || quantity < 1) {
        return res.status(400).json({
          success: false,
          message: "Invalid product quantity",
        });
      }

      if (!size || size.length > 20) {
        return res.status(400).json({
          success: false,
          message: "Valid product size is required",
        });
      }

      const key = `${item.productId}__${size}`;
      const existing = requestedStock.get(key);

      if (existing) {
        existing.quantity += quantity;

        if (!Number.isSafeInteger(existing.quantity)) {
          return res.status(400).json({
            success: false,
            message: "Requested quantity is too large",
          });
        }
      } else {
        requestedStock.set(key, {
          productId: String(item.productId),
          size,
          quantity,
        });
      }
    }

    // Load authoritative product data from MongoDB.
    const productIds = [
      ...new Set(items.map((item) => String(item.productId))),
    ];

    const products = await Product.find({
      _id: { $in: productIds },
    });

    const productById = new Map(
      products.map((product) => [
        String(product._id),
        product,
      ])
    );

    if (productById.size !== productIds.length) {
      return res.status(400).json({
        success: false,
        message: "One or more products no longer exist",
      });
    }

    // Deduct stock. Any failure after a deduction throws,
    // allowing the catch block to restore earlier deductions.
    for (const request of requestedStock.values()) {
      const product = productById.get(request.productId);
      const sizeStock = getSizeStockObject(product);
      const hasSizeStock = Object.keys(sizeStock).length > 0;

      const sizeExists = hasSizeStock
        ? Object.prototype.hasOwnProperty.call(
            sizeStock,
            request.size
          )
        : Array.isArray(product.sizes) &&
          product.sizes.includes(request.size);

      const available = !sizeExists
        ? 0
        : hasSizeStock
          ? Number(sizeStock[request.size] || 0)
          : Number(product.stock || 0);

      if (available < request.quantity) {
        const error = new Error(
          `${product.name} (${request.size}) has only ${available} item(s) left in stock.`
        );
        error.statusCode = 409;
        throw error;
      }

      const query = {
        _id: request.productId,
        stock: { $gte: request.quantity },
      };

      const update = {
        $inc: {
          stock: -request.quantity,
        },
      };

      if (hasSizeStock) {
        query[`sizeStock.${request.size}`] = {
          $gte: request.quantity,
        };

        update.$inc[`sizeStock.${request.size}`] =
          -request.quantity;
      }

      const updatedProduct = await Product.findOneAndUpdate(
        query,
        update,
        { new: true }
      );

      if (!updatedProduct) {
        const error = new Error(
          `${product.name} (${request.size}) stock changed. Please try again.`
        );
        error.statusCode = 409;
        throw error;
      }

      changedStock.push({
        productId: request.productId,
        size: request.size,
        quantity: request.quantity,
        hasSizeStock,
      });
    }

    // Ignore client-supplied prices, names, images and totals.
    const orderItems = items.map((item) => {
      const product = productById.get(String(item.productId));
      const quantity = Number(item.quantity);
      const price = Number(product.price);

      return {
        productId: product._id,
        id: product._id,
        name: product.name,
        image: product.image || "",
        size: String(item.size).trim(),
        price,
        quantity,
        total: Math.round(price * quantity * 100) / 100,
      };
    });

    const subtotal = Math.round(
      orderItems.reduce((sum, item) => sum + item.total, 0) *
        100
    ) / 100;

    // Configure DELIVERY_FEE in backend .env when the
    // store's actual delivery policy has been confirmed.
    const delivery = Number(process.env.DELIVERY_FEE || 0);

    if (!Number.isFinite(delivery) || delivery < 0) {
      throw new Error("Invalid DELIVERY_FEE configuration");
    }

    const total = Math.round((subtotal + delivery) * 100) / 100;

    const order = await Order.create({
      customer: {
        name: customer.name.trim(),
        mobile: customer.mobile.trim(),
        address: customer.address.trim(),
        city: customer.city.trim(),
        pincode: customer.pincode.trim(),
        notes: String(customer.notes || "").trim(),
      },
      items: orderItems,
      subtotal,
      delivery,
      total,
      paymentMethod: "COD",
      status: "Pending",
    });

    return res.status(201).json({
      success: true,
      message: "COD order created successfully",
      order,
    });
  } catch (error) {
    console.error("Order Error:", error.message);

    // Restore every stock deduction if the order failed.
    let rollbackFailed = false;

    for (const changed of [...changedStock].reverse()) {
      try {
        const rollbackUpdate = {
          $inc: {
            stock: changed.quantity,
          },
        };

        if (changed.hasSizeStock) {
          rollbackUpdate.$inc[
            `sizeStock.${changed.size}`
          ] = changed.quantity;
        }

        const restored = await Product.findByIdAndUpdate(
          changed.productId,
          rollbackUpdate
        );

        if (!restored) {
          rollbackFailed = true;
          console.error(
            "Stock rollback failed: product not found",
            changed.productId
          );
        }
      } catch (rollbackError) {
        rollbackFailed = true;
        console.error("Stock rollback error:", rollbackError.message);
      }
    }

    if (rollbackFailed) {
      return res.status(500).json({
        success: false,
        message:
          "Order failed and stock restoration needs administrator attention.",
      });
    }

    return res.status(error.statusCode || 500).json({
      success: false,
      message:
        error.statusCode === 409
          ? error.message
          : "Failed to create order. Please try again.",
    });
  }
});



// ========================================
// GET ALL ORDERS
// ADMIN ONLY
// ========================================

app.get(
  "/api/orders",
  adminAuth,
  async (req, res) => {
    try {
      const orders =
        await Order.find().sort({
          createdAt: -1,
        });

      res.json({
        success: true,
        count:
          orders.length,
        orders,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Failed to fetch orders",
      });
    }
  }
);


// ========================================
// UPDATE ORDER STATUS
// ADMIN ONLY
// ========================================

app.patch(
  "/api/orders/:id/status",
  adminAuth,
  async (req, res) => {
    try {
      const {
        status,
      } = req.body;

      const allowedStatuses = [
        "Pending",
        "Confirmed",
        "Shipped",
        "Delivered",
        "Cancelled",
      ];

      if (
        !allowedStatuses.includes(
          status
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid order status",
        });
      }

      const order =
        await Order.findById(
          req.params.id
        );

      if (!order) {
        return res.status(404).json({
          success: false,
          message:
            "Order not found",
        });
      }

      const previousStatus =
        order.status;
        if (
  previousStatus === "Cancelled" &&
  status !== "Cancelled"
) {
  return res.status(409).json({
    success: false,
    message: "A cancelled order cannot be reopened.",
  });
}


      // ==================================
      // CANCEL ORDER
      // RESTORE STOCK
      // ==================================

      if (
        status === "Cancelled" &&
        previousStatus !==
          "Cancelled"
      ) {
        for (
          const item
          of order.items
        ) {
          if (
            item.productId &&
            mongoose.Types.ObjectId.isValid(
              item.productId
            )
          ) {
            const productToRestore =
              await Product.findById(
                item.productId
              );

            if (productToRestore) {
              const currentSizeStock =
                getSizeStockObject(
                  productToRestore
                );

              const hasSizeStock =
                Object.keys(
                  currentSizeStock
                ).length > 0;

              const restoreUpdate = {
                $inc: {
                  stock:
                    item.quantity,
                },
              };

              if (
                hasSizeStock &&
                item.size
              ) {
                restoreUpdate.$inc[
                  `sizeStock.${item.size}`
                ] = item.quantity;
              }

              await Product.findByIdAndUpdate(
                item.productId,
                restoreUpdate
              );
            }
          }
        }
      }


      order.status =
        status;

      await order.save();

      res.json({
        success: true,
        message:
          "Order status updated",
        order,
      });

    } catch (error) {
      console.log(
        "Status update error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update status",
      });
    }
  }
);


// ========================================
// GET PRODUCTS
// PUBLIC
// ========================================

app.get(
  "/api/products",
  async (req, res) => {
    try {
      const products =
        await Product.find().sort({
          createdAt: -1,
        });

      res.json({
        success: true,
        products,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Failed to fetch products",
      });
    }
  }
);


// ========================================
// ADD PRODUCT
// ADMIN ONLY
// ========================================

app.post(
  "/api/products",
  adminAuth,
  async (req, res) => {
    try {
      const {
        name,
        category,
        price,
        oldPrice,
        badge,
        image,
        description,
        sizes,
        stock,
        sizeStock,
      } = req.body;

      if (
        !name ||
        !category ||
        price === undefined ||
        price === "" ||
        !image
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Name, category, price and image are required",
        });
      }

      const cleanedSizeStock =
        cleanSizeStock(
          sizeStock
        );

      const finalSizes =
        Array.isArray(sizes)
          ? sizes
              .map((size) =>
                String(size).trim()
              )
              .filter(Boolean)
          : [];

      // If sizeStock is supplied,
      // calculate total stock automatically.
      const totalStock =
        Object.keys(
          cleanedSizeStock
        ).length > 0
          ? calculateTotalStock(
              cleanedSizeStock
            )
          : Number(stock) || 0;

      const product =
        await Product.create({
          name,

          category,

          price:
            Number(price),

          oldPrice:
            Number(oldPrice) || 0,

          badge:
            badge || "NEW",

          image,

          description:
            description || "",

          sizes:
            finalSizes,

          stock:
            totalStock,

          sizeStock:
            cleanedSizeStock,
        });

      res.status(201).json({
        success: true,
        message:
          "Product added successfully",
        product,
      });

    } catch (error) {
      console.log(
        "Add product error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to add product",
      });
    }
  }
);


// ========================================
// UPDATE PRODUCT
// ADMIN ONLY
// ========================================

app.put(
  "/api/products/:id",
  adminAuth,
  async (req, res) => {
    try {
      const {
        name,
        category,
        price,
        oldPrice,
        badge,
        image,
        description,
        sizes,
        stock,
        sizeStock,
      } = req.body;

      const updateData = {
        name,
        category,
        price:
          Number(price),

        oldPrice:
          Number(oldPrice) || 0,

        badge:
          badge || "NEW",

        image,

        description:
          description || "",

        sizes:
          Array.isArray(sizes)
            ? sizes
                .map((size) =>
                  String(size).trim()
                )
                .filter(Boolean)
            : [],
      };


      if (
        sizeStock &&
        typeof sizeStock ===
          "object"
      ) {
        const cleanedSizeStock =
          cleanSizeStock(
            sizeStock
          );

        updateData.sizeStock =
          cleanedSizeStock;

        updateData.stock =
          calculateTotalStock(
            cleanedSizeStock
          );
      } else {
        updateData.stock =
          Number(stock) || 0;
      }


      const product =
        await Product.findByIdAndUpdate(
          req.params.id,
          updateData,
          {
            new: true,
            runValidators: true,
          }
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      res.json({
        success: true,
        message:
          "Product updated successfully",
        product,
      });

    } catch (error) {
      console.log(
        "Update product error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to update product",
      });
    }
  }
);


// ========================================
// DELETE PRODUCT
// ADMIN ONLY
// ========================================

app.delete(
  "/api/products/:id",
  adminAuth,
  async (req, res) => {
    try {
      const product =
        await Product.findByIdAndDelete(
          req.params.id
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      res.json({
        success: true,
        message:
          "Product deleted successfully",
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Failed to delete product",
      });
    }
  }
);


// ========================================
// GET SINGLE PRODUCT
// PUBLIC
// ========================================

app.get(
  "/api/products/:id",
  async (req, res) => {
    try {
      if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      const product =
        await Product.findById(
          req.params.id
        );

      if (!product) {
        return res.status(404).json({
          success: false,
          message:
            "Product not found",
        });
      }

      res.json({
        success: true,
        product,
      });

    } catch (error) {
      console.log(
        "Single product error:",
        error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Failed to fetch product",
      });
    }
  }
);


// ========================================
// MULTER ERROR HANDLER
// ========================================

app.use(
  (
    error,
    req,
    res,
    next
  ) => {
    if (
      error instanceof
      multer.MulterError
    ) {
      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Image size must be less than 10MB",
        });
      }

      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    if (error) {
      return res.status(400).json({
        success: false,
        message:
          error.message,
      });
    }

    next();
  }
);


// ========================================
// SERVER
// ========================================

const PORT =
  process.env.PORT || 5001;

app.listen(
  PORT,
  () => {
    console.log(
      `Server running on port ${PORT} 🚀`
    );
  }
);

module.exports = app;