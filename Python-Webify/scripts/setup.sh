#!/bin/bash
# GAP Protection Setup Script

set -e

echo "🛡️  GAP Protection - Setup Script"
echo "=================================="

# Check Python version
echo "Checking Python version..."
python_version=$(python3 --version 2>&1 | awk '{print $2}')
required_version="3.11"

if [ "$(printf '%s\n' "$required_version" "$python_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Python 3.11+ required. Found: $python_version"
    exit 1
fi
echo "✅ Python $python_version"

# Check Node.js version
echo "Checking Node.js version..."
node_version=$(node --version 2>&1 | sed 's/v//')
required_node="18.0.0"

if [ "$(printf '%s\n' "$required_node" "$node_version" | sort -V | head -n1)" != "$required_node" ]; then
    echo "❌ Node.js 18+ required. Found: $node_version"
    exit 1
fi
echo "✅ Node.js $node_version"

# Create .env if not exists
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "⚠️  Please edit .env and add your API keys!"
fi

# Install Python dependencies
echo "Installing Python dependencies..."
pip install -e .

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

# Create necessary directories
echo "Creating directories..."
mkdir -p logs reports vuln

# Check if database is configured
if grep -q "DATABASE_URL=postgresql" .env; then
    echo "Database configured. Run 'npm run db:push' to initialize schema."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your API keys"
echo "2. If using database: npm run db:push"
echo "3. Start development: npm run dev"
echo "4. Or build for production: npm run build && npm start"
