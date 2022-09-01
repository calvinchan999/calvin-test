/* -- BEGIN LICENSE BLOCK ----------------------------------------------
  (c) Copyright 2018 FZI Forschungszentrum Informatik, Karlsruhe, Germany

  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
  IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
  FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
  CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
  DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
  DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY
  WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
-- END LICENSE BLOCK ------------------------------------------------*/


import { Injectable } from '@angular/core';
import { Observable, Observer } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ResourceLoaderService {
  constructor() { }

  loadResource(names: string[], basePath = 'assets', extension = 'svg'): Observable<any> {
    const loader = new PIXI.Loader(basePath);
    names.forEach(name => {
      loader.add(name, `${name}.${extension}`);
    });

    return Observable.create((observer: Observer<any>) => {
      loader.load((loader, resources) => {
        observer.next(resources);
        observer.complete();
      });
      loader.onError.once(e => observer.error(e));
    });
  }

}
