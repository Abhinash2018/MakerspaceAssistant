import base64
import io
import os
import unittest
from unittest.mock import patch
from PIL import Image
import numpy as np
from fastapi.testclient import TestClient
import app as service

class SecurityTests(unittest.TestCase):
    def setUp(self):
        os.environ['FACE_SERVICE_KEY'] = 'x' * 43
        self.client = TestClient(service.app)
        self.headers = {'Authorization': 'Bearer ' + 'x' * 43}
        b = io.BytesIO(); Image.new('RGB', (640,480), (120,120,120)).save(b, format='JPEG')
        self.image = 'data:image/jpeg;base64,' + base64.b64encode(b.getvalue()).decode()
        self.unit = np.zeros(128); self.unit[0] = 1
    def test_auth(self):
        self.assertEqual(self.client.post('/v1/embedding', json={}).status_code,401)
    def test_stream_limit(self):
        self.assertEqual(self.client.post('/v1/embedding',content=b'x'*1800001,headers=self.headers).status_code,413)
    def test_static_replay_rejected(self):
        with patch.object(service,'features',return_value=(self.unit,0.0)):
            r=self.client.post('/v1/embedding',json={'frames':[self.image]*3,'direction':'left'},headers=self.headers)
            self.assertEqual(r.status_code,422)
    def test_direction_and_return(self):
        for direction,yaw,expected in [('left',0.2,200),('right',-0.2,200),('left',-0.2,422)]:
            with patch.object(service,'features',side_effect=[(self.unit,0),(self.unit,yaw),(self.unit,0)]):
                r=self.client.post('/v1/embedding',json={'frames':[self.image]*3,'direction':direction},headers=self.headers)
                self.assertEqual(r.status_code,expected)
                if expected==200:self.assertEqual(len(r.json()['vector']),128)
    def test_large_image_dimensions(self):
        b=io.BytesIO();Image.new('RGB',(2000,2000)).save(b,format='JPEG')
        with self.assertRaises(ValueError):service.decode('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
    def test_real_models_reject_blank(self):
        # Exercises actual OpenCV models without using any person's biometric data.
        if not (service.MODELS/'sface.onnx').exists(): self.skipTest('Models not downloaded')
        r=self.client.post('/v1/embedding',json={'frames':[self.image]*3,'direction':'left'},headers=self.headers)
        self.assertEqual(r.status_code,422)

if __name__=='__main__': unittest.main()
