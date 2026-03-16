#!/usr/bin/env python3
"""Tests for logger module"""
import pytest
import logging
from pathlib import Path
from utils.logger import setup_logger, get_logger


class TestLogger:
    """Test logging functionality"""
    
    def test_setup_logger_default(self):
        """Test default logger setup"""
        logger = setup_logger("test_logger")
        assert logger is not None
        assert logger.level == logging.INFO
        assert len(logger.handlers) > 0
    
    def test_setup_logger_with_file(self, tmp_path):
        """Test logger with file output"""
        log_file = tmp_path / "test.log"
        logger = setup_logger("test_file_logger", log_file=str(log_file))
        
        logger.info("Test message")
        
        assert log_file.exists()
        content = log_file.read_text()
        assert "Test message" in content
    
    def test_get_logger(self):
        """Test get_logger function"""
        logger = get_logger("test_get_logger")
        assert logger is not None
        assert isinstance(logger, logging.Logger)
    
    def test_logger_levels(self):
        """Test different log levels"""
        logger = setup_logger("test_levels", level=logging.DEBUG)
        
        # Should not raise exceptions
        logger.debug("Debug message")
        logger.info("Info message")
        logger.warning("Warning message")
        logger.error("Error message")
        logger.critical("Critical message")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
