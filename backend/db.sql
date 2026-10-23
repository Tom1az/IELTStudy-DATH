-- Ket noi vao database ieltstudy truoc khi chay file nay.
-- Vi du: psql -d ieltstudy -v ON_ERROR_STOP=1 -f db.sql
-- IF NOT EXISTS giu nguyen bang da co, khong cap nhat cau truc bang cu.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    hashed_pass VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    order_id SERIAL PRIMARY KEY,
    status VARCHAR(20) NOT NULL CHECK (
        status IN ('pending', 'processing', 'shipping', 'completed', 'cancelled')
    ),
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(10) NOT NULL,
    customer_address VARCHAR(255) NOT NULL,
    total_product INT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(255),
    price DECIMAL(10, 2) NOT NULL,
    stock_quantity INT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS order_items (
    quantity INT NOT NULL CHECK (quantity > 0),
    price DECIMAL(10, 2) NOT NULL,
    order_id INT NOT NULL REFERENCES orders(order_id),
    product_id INT NOT NULL REFERENCES products(product_id),
    PRIMARY KEY (order_id, product_id)
);

CREATE TABLE IF NOT EXISTS carts (
    cart_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL UNIQUE REFERENCES users(user_id)
);

CREATE TABLE IF NOT EXISTS cart_items (
    cart_item_id SERIAL PRIMARY KEY,
    quantity INT NOT NULL,
    cart_id INT NOT NULL REFERENCES carts(cart_id),
    product_id INT NOT NULL REFERENCES products(product_id),
    UNIQUE (cart_id, product_id)
);

COMMIT;
