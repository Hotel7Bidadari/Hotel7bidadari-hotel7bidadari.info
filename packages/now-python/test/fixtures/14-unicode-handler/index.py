from http.server import BaseHTTPRequestHandler
import json

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        post_body = json.loads(self.rfile.read().decode('utf-8'))
        name = post_body.get('name', 'someone')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        response_data = {'greeting': f'hello, {name}'}
        self.wfile.write(json.dumps(response_data).encode('utf-8'))
        return
