async function getToken() {
  const response = await fetch('/resort/oidc/access-token');

  if (response.ok) {
    const p = document.createElement('p');
    p.innerHTML = await response.text();
    document.body.appendChild(p);
  }
}

getToken();

setInterval(() => getToken(), 10000);
