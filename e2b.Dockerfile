FROM e2bdev/desktop:latest

USER root

# Install Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    node --version && \
    npm --version

# Install Playwright globally
RUN npm install -g playwright@latest

# Install Chromium browser + all dependencies
RUN playwright install chromium --with-deps

# Install Python packages for fallback
RUN pip install requests beautifulsoup4

# Verify everything
RUN node --version && \
    npx playwright --version && \
    python3 --version && \
    echo "FlowOS template ready ✓"
