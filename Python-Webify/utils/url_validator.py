#!/usr/bin/env python3
"""
URL Validation and Sanitization Module
Prevents SSRF and other URL-based attacks
"""
from urllib.parse import urlparse
from typing import Optional, Tuple
import re
import ipaddress

class URLValidator:
    """Validates and sanitizes URLs for security scanning"""
    
    # Allowed schemes
    ALLOWED_SCHEMES = {'http', 'https'}
    
    # Blocked IP ranges (RFC 1918 private networks, localhost, etc.)
    BLOCKED_IP_RANGES = [
        ipaddress.ip_network('127.0.0.0/8'),      # Localhost
        ipaddress.ip_network('10.0.0.0/8'),       # Private
        ipaddress.ip_network('172.16.0.0/12'),    # Private
        ipaddress.ip_network('192.168.0.0/16'),   # Private
        ipaddress.ip_network('169.254.0.0/16'),   # Link-local
        ipaddress.ip_network('::1/128'),          # IPv6 localhost
        ipaddress.ip_network('fc00::/7'),         # IPv6 private
        ipaddress.ip_network('fe80::/10'),        # IPv6 link-local
    ]
    
    # Blocked domains
    BLOCKED_DOMAINS = {
        'localhost',
        'metadata.google.internal',  # GCP metadata
        '169.254.169.254',            # AWS/Azure metadata
    }
    
    @classmethod
    def validate(cls, url: str, allow_private: bool = False) -> Tuple[bool, Optional[str]]:
        """
        Validate URL for security
        
        Args:
            url: URL to validate
            allow_private: Allow private IP ranges (for internal scanning)
            
        Returns:
            Tuple of (is_valid, error_message)
        """
        if not url or not isinstance(url, str):
            return False, "URL must be a non-empty string"
        
        # Basic format check
        if not url.startswith(('http://', 'https://')):
            return False, "URL must start with http:// or https://"
        
        try:
            parsed = urlparse(url)
        except Exception as e:
            return False, f"Invalid URL format: {str(e)}"
        
        # Check scheme
        if parsed.scheme not in cls.ALLOWED_SCHEMES:
            return False, f"Scheme must be one of: {', '.join(cls.ALLOWED_SCHEMES)}"
        
        # Check hostname exists
        if not parsed.hostname:
            return False, "URL must have a valid hostname"
        
        # Check for blocked domains
        hostname_lower = parsed.hostname.lower()
        if hostname_lower in cls.BLOCKED_DOMAINS:
            return False, f"Domain '{parsed.hostname}' is blocked"
        
        # Check for IP address
        if not allow_private:
            try:
                ip = ipaddress.ip_address(parsed.hostname)
                for blocked_range in cls.BLOCKED_IP_RANGES:
                    if ip in blocked_range:
                        return False, f"Private/internal IP addresses are not allowed: {parsed.hostname}"
            except ValueError:
                # Not an IP address, continue with domain checks
                pass
        
        # Check for suspicious patterns
        if '@' in parsed.netloc:
            return False, "URLs with authentication credentials are not allowed"
        
        # Check for URL encoding tricks
        if '%' in parsed.hostname:
            return False, "URL-encoded hostnames are not allowed"
        
        # Check for unicode/IDN homograph attacks
        if any(ord(c) > 127 for c in parsed.hostname):
            return False, "Non-ASCII characters in hostname are not allowed"
        
        return True, None
    
    @classmethod
    def sanitize(cls, url: str) -> str:
        """
        Sanitize URL by removing dangerous components
        
        Args:
            url: URL to sanitize
            
        Returns:
            Sanitized URL
        """
        parsed = urlparse(url)
        
        # Remove credentials
        netloc = parsed.hostname
        if parsed.port:
            netloc = f"{netloc}:{parsed.port}"
        
        # Rebuild URL without credentials and fragments
        sanitized = f"{parsed.scheme}://{netloc}{parsed.path}"
        if parsed.query:
            sanitized += f"?{parsed.query}"
        
        return sanitized
    
    @classmethod
    def is_same_origin(cls, url1: str, url2: str) -> bool:
        """
        Check if two URLs have the same origin
        
        Args:
            url1: First URL
            url2: Second URL
            
        Returns:
            True if same origin
        """
        try:
            p1 = urlparse(url1)
            p2 = urlparse(url2)
            return (p1.scheme == p2.scheme and 
                    p1.hostname == p2.hostname and 
                    p1.port == p2.port)
        except:
            return False


def validate_url(url: str, allow_private: bool = False) -> Tuple[bool, Optional[str]]:
    """Convenience function for URL validation"""
    return URLValidator.validate(url, allow_private)


def sanitize_url(url: str) -> str:
    """Convenience function for URL sanitization"""
    return URLValidator.sanitize(url)
