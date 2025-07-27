"""
API Connectors for External Services Integration
Provides unified interface for all external APIs used in the Hazard Detection system.
"""

import os
import json
import aiohttp
import asyncio
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
from datetime import datetime
import logging

# Set up logging
logger = logging.getLogger(__name__)

@dataclass
class APIResponse:
    """Standardized API response format"""
    success: bool
    data: Any = None
    error: str = None
    status_code: int = None

class BaseAPIConnector:
    """Base class for all API connectors"""
    
    def __init__(self, api_key: str = None, base_url: str = None):
        self.api_key = api_key
        self.base_url = base_url
        self.session = None
    
    async def _init_session(self):
        """Initialize aiohttp session"""
        if not self.session:
            self.session = aiohttp.ClientSession()
    
    async def _close_session(self):
        """Close aiohttp session"""
        if self.session:
            await self.session.close()
    
    async def _make_request(self, method: str, endpoint: str, **kwargs) -> APIResponse:
        """Make HTTP request with error handling"""
        await self._init_session()
        
        try:
            url = f"{self.base_url}{endpoint}" if self.base_url else endpoint
            
            async with self.session.request(method, url, **kwargs) as response:
                content = await response.text()
                
                try:
                    data = json.loads(content) if content else None
                except json.JSONDecodeError:
                    data = content
                
                return APIResponse(
                    success=response.status < 400,
                    data=data,
                    status_code=response.status,
                    error=None if response.status < 400 else f"HTTP {response.status}: {content}"
                )
                
        except Exception as e:
            logger.error(f"API request failed: {str(e)}")
            return APIResponse(
                success=False,
                error=str(e)
            )

class GoogleMapsConnector(BaseAPIConnector):
    """Google Maps API connector for geocoding and location services"""
    
    def __init__(self):
        api_key = os.getenv('GOOGLE_GEOCODING_API_KEY')
        super().__init__(api_key, "https://maps.googleapis.com/maps/api")
    
    async def geocode_address(self, address: str) -> APIResponse:
        """Convert address to coordinates"""
        params = {
            'address': address,
            'key': self.api_key
        }
        
        return await self._make_request(
            'GET', 
            '/geocode/json',
            params=params
        )
    
    async def reverse_geocode(self, lat: float, lng: float) -> APIResponse:
        """Convert coordinates to address"""
        params = {
            'latlng': f"{lat},{lng}",
            'key': self.api_key
        }
        
        return await self._make_request(
            'GET',
            '/geocode/json',
            params=params
        )

class CloudinaryConnector(BaseAPIConnector):
    """Cloudinary API connector for image storage and processing"""
    
    def __init__(self):
        self.cloud_name = os.getenv('CLOUDINARY_CLOUD_NAME')
        self.api_key = os.getenv('CLOUDINARY_API_KEY')
        self.api_secret = os.getenv('CLOUDINARY_API_SECRET')
        super().__init__(self.api_key, f"https://api.cloudinary.com/v1_1/{self.cloud_name}")
    
    async def upload_image(self, image_data: bytes, public_id: str = None) -> APIResponse:
        """Upload image to Cloudinary"""
        data = aiohttp.FormData()
        data.add_field('file', image_data)
        data.add_field('api_key', self.api_key)
        
        if public_id:
            data.add_field('public_id', public_id)
        
        # Generate signature (simplified - in production use proper signing)
        import time
        timestamp = int(time.time())
        data.add_field('timestamp', str(timestamp))
        
        return await self._make_request(
            'POST',
            '/image/upload',
            data=data
        )

class SendGridConnector(BaseAPIConnector):
    """SendGrid API connector for email services"""
    
    def __init__(self):
        api_key = os.getenv('SENDGRID_API_KEY')
        super().__init__(api_key, "https://api.sendgrid.com/v3")
    
    async def send_email(self, to_email: str, subject: str, content: str) -> APIResponse:
        """Send email via SendGrid"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Content-Type': 'application/json'
        }
        
        payload = {
            'personalizations': [{
                'to': [{'email': to_email}]
            }],
            'from': {'email': 'noreply@hazarddetection.com'},
            'subject': subject,
            'content': [{
                'type': 'text/plain',
                'value': content
            }]
        }
        
        return await self._make_request(
            'POST',
            '/mail/send',
            headers=headers,
            json=payload
        )

class RedisConnector(BaseAPIConnector):
    """Redis connector for caching and session management"""
    
    def __init__(self):
        import redis.asyncio as redis
        self.redis_client = redis.Redis(
            host=os.getenv('REDIS_HOST'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            password=os.getenv('REDIS_PASSWORD'),
            decode_responses=True
        )
    
    async def set_data(self, key: str, value: str, expiry: int = 3600) -> APIResponse:
        """Set data in Redis with expiry"""
        try:
            await self.redis_client.setex(key, expiry, value)
            return APIResponse(success=True, data="Data stored successfully")
        except Exception as e:
            return APIResponse(success=False, error=str(e))
    
    async def get_data(self, key: str) -> APIResponse:
        """Get data from Redis"""
        try:
            data = await self.redis_client.get(key)
            return APIResponse(success=True, data=data)
        except Exception as e:
            return APIResponse(success=False, error=str(e))

class RenderAPIConnector(BaseAPIConnector):
    """Render API connector for deployment management"""
    
    def __init__(self):
        api_key = os.getenv('RENDER_API_KEY', 'rnd_9obq1Ruco6pAjyOf7rWN5JDFcTFK')
        super().__init__(api_key, "https://api.render.com/v1")
    
    async def get_services(self) -> APIResponse:
        """Get all services"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json'
        }
        
        return await self._make_request(
            'GET',
            '/services',
            headers=headers
        )
    
    async def get_service_status(self, service_id: str) -> APIResponse:
        """Get service status"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json'
        }
        
        return await self._make_request(
            'GET',
            f'/services/{service_id}',
            headers=headers
        )
    
    async def deploy_service(self, service_id: str) -> APIResponse:
        """Trigger service deployment"""
        headers = {
            'Authorization': f'Bearer {self.api_key}',
            'Accept': 'application/json'
        }
        
        return await self._make_request(
            'POST',
            f'/services/{service_id}/deploys',
            headers=headers
        )

class APIConnectorManager:
    """Centralized manager for all API connectors"""
    
    def __init__(self):
        self.google_maps = GoogleMapsConnector()
        self.cloudinary = CloudinaryConnector()
        self.sendgrid = SendGridConnector()
        self.redis = RedisConnector()
        self.render = RenderAPIConnector()
    
    async def health_check(self) -> Dict[str, bool]:
        """Check health of all external services"""
        health_status = {}
        
        # Test Google Maps
        try:
            response = await self.google_maps.geocode_address("1600 Amphitheatre Parkway, Mountain View, CA")
            health_status['google_maps'] = response.success
        except:
            health_status['google_maps'] = False
        
        # Test Redis
        try:
            response = await self.redis.set_data("health_check", "ok", 60)
            health_status['redis'] = response.success
        except:
            health_status['redis'] = False
        
        # Test Render API
        try:
            response = await self.render.get_services()
            health_status['render'] = response.success
        except:
            health_status['render'] = False
        
        health_status['sendgrid'] = bool(os.getenv('SENDGRID_API_KEY'))
        health_status['cloudinary'] = bool(os.getenv('CLOUDINARY_API_KEY'))
        
        return health_status
    
    async def close_all_sessions(self):
        """Close all open sessions"""
        connectors = [self.google_maps, self.cloudinary, self.sendgrid, self.render]
        for connector in connectors:
            await connector._close_session()

# Global instance
api_manager = APIConnectorManager()

# Convenience functions
async def geocode_location(address: str) -> APIResponse:
    """Geocode an address"""
    return await api_manager.google_maps.geocode_address(address)

async def reverse_geocode_location(lat: float, lng: float) -> APIResponse:
    """Reverse geocode coordinates"""
    return await api_manager.google_maps.reverse_geocode(lat, lng)

async def upload_detection_image(image_data: bytes, detection_id: str) -> APIResponse:
    """Upload detection image to Cloudinary"""
    return await api_manager.cloudinary.upload_image(image_data, f"detection_{detection_id}")

async def send_alert_email(to_email: str, hazard_type: str, location: str) -> APIResponse:
    """Send hazard alert email"""
    subject = f"Hazard Alert: {hazard_type} detected"
    content = f"A {hazard_type} has been detected at location: {location}"
    return await api_manager.sendgrid.send_email(to_email, subject, content)

async def cache_detection_result(detection_id: str, result: dict, expiry: int = 3600) -> APIResponse:
    """Cache detection result in Redis"""
    return await api_manager.redis.set_data(f"detection_{detection_id}", json.dumps(result), expiry)

async def get_cached_detection(detection_id: str) -> APIResponse:
    """Get cached detection result"""
    response = await api_manager.redis.get_data(f"detection_{detection_id}")
    if response.success and response.data:
        try:
            response.data = json.loads(response.data)
        except json.JSONDecodeError:
            pass
    return response