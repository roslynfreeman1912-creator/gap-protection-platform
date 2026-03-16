#!/usr/bin/env python3
"""Tests for URL validator"""
import pytest
from utils.url_validator import URLValidator, validate_url, sanitize_url


class TestURLValidator:
    """Test URL validation functionality"""
    
    def test_valid_http_url(self):
        """Test valid HTTP URL"""
        is_valid, error = validate_url("http://example.com")
        assert is_valid is True
        assert error is None
    
    def test_valid_https_url(self):
        """Test valid HTTPS URL"""
        is_valid, error = validate_url("https://example.com")
        assert is_valid is True
        assert error is None
    
    def test_invalid_scheme(self):
        """Test invalid URL scheme"""
        is_valid, error = validate_url("ftp://example.com")
        assert is_valid is False
        assert "Scheme must be" in error
    
    def test_localhost_blocked(self):
        """Test localhost is blocked"""
        is_valid, error = validate_url("http://localhost")
        assert is_valid is False
        assert "blocked" in error.lower()
    
    def test_private_ip_blocked(self):
        """Test private IP is blocked"""
        is_valid, error = validate_url("http://192.168.1.1")
        assert is_valid is False
        assert "Private/internal" in error
    
    def test_private_ip_allowed(self):
        """Test private IP allowed with flag"""
        is_valid, error = validate_url("http://192.168.1.1", allow_private=True)
        assert is_valid is True
        assert error is None
    
    def test_url_with_credentials_blocked(self):
        """Test URL with credentials is blocked"""
        is_valid, error = validate_url("http://user:pass@example.com")
        assert is_valid is False
        assert "credentials" in error.lower()
    
    def test_sanitize_url(self):
        """Test URL sanitization"""
        sanitized = sanitize_url("http://user:pass@example.com/path?query=1#fragment")
        assert "user:pass" not in sanitized
        assert "#fragment" not in sanitized
        assert "?query=1" in sanitized
    
    def test_empty_url(self):
        """Test empty URL"""
        is_valid, error = validate_url("")
        assert is_valid is False
        assert "non-empty" in error.lower()
    
    def test_url_without_scheme(self):
        """Test URL without scheme"""
        is_valid, error = validate_url("example.com")
        assert is_valid is False
        assert "must start with" in error.lower()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
